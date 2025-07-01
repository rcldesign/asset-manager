import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { addSyncJob } from '../lib/queue';
import type { SyncQueue, SyncClient } from '@prisma/client';

export interface ServiceWorkerSyncEvent {
  tag: string;
  lastChance: boolean;
  clientId: string;
  data?: any;
}

export interface BackgroundSyncRegistration {
  tag: string;
  minInterval?: number; // Minimum interval between syncs in ms
  maxRetries?: number;
  requiresNetwork?: boolean;
  requiresCharging?: boolean;
}

/**
 * Service to manage service worker background sync operations
 * Handles registration, processing, and retry logic for offline sync
 */
export class ServiceWorkerSyncService {
  private readonly DEFAULT_MIN_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly DEFAULT_MAX_RETRIES = 3;

  /**
   * Register a background sync task
   */
  async registerBackgroundSync(
    userId: string,
    deviceId: string,
    registration: BackgroundSyncRegistration
  ): Promise<void> {
    const client = await prisma.syncClient.findFirst({
      where: { userId, deviceId }
    });

    if (!client) {
      throw new Error('Sync client not found');
    }

    // Store sync registration metadata
    await prisma.syncClient.update({
      where: { id: client.id },
      data: {
        syncToken: JSON.stringify({
          ...JSON.parse(client.syncToken || '{}'),
          backgroundSync: {
            ...registration,
            registeredAt: new Date().toISOString()
          }
        })
      }
    });

    logger.info('Background sync registered', {
      userId,
      deviceId,
      tag: registration.tag
    });
  }

  /**
   * Process a service worker sync event
   */
  async processSyncEvent(event: ServiceWorkerSyncEvent): Promise<void> {
    const { tag, lastChance, clientId } = event;

    logger.info('Processing service worker sync event', {
      tag,
      lastChance,
      clientId
    });

    try {
      // Get pending sync items for this client
      const pendingItems = await this.getPendingSyncItems(clientId, tag);

      if (pendingItems.length === 0) {
        logger.info('No pending sync items found', { clientId, tag });
        return;
      }

      // Process sync items based on tag
      switch (tag) {
        case 'sync-all':
          await this.processSyncAll(clientId, pendingItems);
          break;
        
        case 'sync-critical':
          await this.processCriticalSync(clientId, pendingItems);
          break;
        
        case 'sync-assets':
          await this.processSyncByType(clientId, pendingItems, 'asset');
          break;
        
        case 'sync-tasks':
          await this.processSyncByType(clientId, pendingItems, 'task');
          break;
        
        case 'sync-schedules':
          await this.processSyncByType(clientId, pendingItems, 'schedule');
          break;
        
        default:
          await this.processCustomSync(clientId, tag, pendingItems);
      }

      // Handle last chance scenario
      if (lastChance) {
        await this.handleLastChanceSync(clientId, tag, pendingItems);
      }
    } catch (error) {
      logger.error('Error processing sync event', {
        tag,
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get pending sync items for a client
   */
  private async getPendingSyncItems(
    clientId: string,
    tag?: string
  ): Promise<SyncQueue[]> {
    const whereConditions: any = {
      clientId,
      status: { in: ['PENDING', 'FAILED'] }
    };

    // Filter by tag if provided
    if (tag && tag !== 'sync-all') {
      // Extract entity type from tag (e.g., 'sync-assets' -> 'asset')
      const entityType = tag.replace('sync-', '').replace(/s$/, '');
      if (['asset', 'task', 'schedule', 'location'].includes(entityType)) {
        whereConditions.entityType = entityType;
      }
    }

    return await prisma.syncQueue.findMany({
      where: whereConditions,
      orderBy: [
        { retryCount: 'asc' },
        { createdAt: 'asc' }
      ],
      take: 100 // Limit batch size
    });
  }

  /**
   * Process all pending sync items
   */
  private async processSyncAll(
    clientId: string,
    items: SyncQueue[]
  ): Promise<void> {
    // Queue sync job for batch processing
    await addSyncJob({
      type: 'batch-sync',
      clientId,
      itemIds: items.map(item => item.id)
    });
  }

  /**
   * Process critical sync items (high priority)
   */
  private async processCriticalSync(
    clientId: string,
    items: SyncQueue[]
  ): Promise<void> {
    // Filter critical items (e.g., status updates, assignments)
    const criticalItems = items.filter(item => {
      const payload = item.payload as any;
      return (
        item.operation === 'UPDATE' &&
        (payload.status || payload.assignedTo || payload.priority === 'HIGH')
      );
    });

    if (criticalItems.length > 0) {
      await addSyncJob({
        type: 'critical-sync',
        clientId,
        itemIds: criticalItems.map(item => item.id),
        priority: 10 // High priority
      });
    }
  }

  /**
   * Process sync items by entity type
   */
  private async processSyncByType(
    clientId: string,
    items: SyncQueue[],
    entityType: string
  ): Promise<void> {
    const filteredItems = items.filter(item => item.entityType === entityType);

    if (filteredItems.length > 0) {
      await addSyncJob({
        type: 'type-sync',
        clientId,
        entityType,
        itemIds: filteredItems.map(item => item.id)
      });
    }
  }

  /**
   * Process custom sync based on tag
   */
  private async processCustomSync(
    clientId: string,
    tag: string,
    items: SyncQueue[]
  ): Promise<void> {
    // Handle custom sync tags
    logger.info('Processing custom sync', { clientId, tag, itemCount: items.length });

    await addSyncJob({
      type: 'custom-sync',
      clientId,
      tag,
      itemIds: items.map(item => item.id)
    });
  }

  /**
   * Handle last chance sync scenario
   */
  private async handleLastChanceSync(
    clientId: string,
    tag: string,
    items: SyncQueue[]
  ): Promise<void> {
    logger.warn('Last chance sync triggered', {
      clientId,
      tag,
      pendingItems: items.length
    });

    // Mark items that exceed retry limit
    const failedItems = items.filter(item => 
      item.retryCount >= this.DEFAULT_MAX_RETRIES
    );

    if (failedItems.length > 0) {
      await prisma.syncQueue.updateMany({
        where: {
          id: { in: failedItems.map(item => item.id) }
        },
        data: {
          status: 'FAILED',
          errorMessage: 'Max retries exceeded - sync abandoned'
        }
      });

      // Notify user about failed syncs
      await this.notifyFailedSync(clientId, failedItems);
    }
  }

  /**
   * Notify user about failed sync items
   */
  private async notifyFailedSync(
    clientId: string,
    failedItems: SyncQueue[]
  ): Promise<void> {
    const client = await prisma.syncClient.findUnique({
      where: { id: clientId },
      include: { user: true }
    });

    if (!client) return;

    // Create notification for failed syncs
    await prisma.notification.create({
      data: {
        userId: client.userId,
        organizationId: client.user.organizationId,
        type: 'sync_failed',
        title: 'Sync Failed',
        message: `${failedItems.length} items could not be synced and will need to be re-entered.`,
        metadata: {
          clientId,
          failedCount: failedItems.length,
          entityTypes: [...new Set(failedItems.map(item => item.entityType))]
        }
      }
    });
  }

  /**
   * Get sync queue statistics for monitoring
   */
  async getSyncQueueStats(clientId: string): Promise<{
    pending: number;
    failed: number;
    completed: number;
    byEntityType: Record<string, number>;
    oldestPending?: Date;
  }> {
    const stats = await prisma.syncQueue.groupBy({
      by: ['status', 'entityType'],
      where: { clientId },
      _count: true
    });

    const oldestPending = await prisma.syncQueue.findFirst({
      where: {
        clientId,
        status: 'PENDING'
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    });

    const result = {
      pending: 0,
      failed: 0,
      completed: 0,
      byEntityType: {} as Record<string, number>,
      oldestPending: oldestPending?.createdAt
    };

    stats.forEach(stat => {
      const count = stat._count;
      
      switch (stat.status) {
        case 'PENDING':
          result.pending += count;
          break;
        case 'FAILED':
          result.failed += count;
          break;
        case 'COMPLETED':
          result.completed += count;
          break;
      }

      if (stat.status === 'PENDING') {
        result.byEntityType[stat.entityType] = 
          (result.byEntityType[stat.entityType] || 0) + count;
      }
    });

    return result;
  }

  /**
   * Clean up old completed sync queue items
   */
  async cleanupSyncQueue(daysToKeep: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.syncQueue.deleteMany({
      where: {
        status: 'COMPLETED',
        processedAt: {
          lt: cutoffDate
        }
      }
    });

    logger.info('Cleaned up sync queue', {
      deletedCount: result.count,
      cutoffDate
    });

    return result.count;
  }

  /**
   * Retry failed sync items
   */
  async retryFailedItems(clientId: string, maxRetries?: number): Promise<number> {
    const retryLimit = maxRetries || this.DEFAULT_MAX_RETRIES;

    const failedItems = await prisma.syncQueue.findMany({
      where: {
        clientId,
        status: 'FAILED',
        retryCount: { lt: retryLimit }
      }
    });

    if (failedItems.length === 0) {
      return 0;
    }

    // Reset status to pending for retry
    await prisma.syncQueue.updateMany({
      where: {
        id: { in: failedItems.map(item => item.id) }
      },
      data: {
        status: 'PENDING'
      }
    });

    // Queue for processing
    await addSyncJob({
      type: 'retry-sync',
      clientId,
      itemIds: failedItems.map(item => item.id)
    });

    return failedItems.length;
  }

  /**
   * Get sync health metrics
   */
  async getSyncHealth(organizationId: string): Promise<{
    healthScore: number;
    activeClients: number;
    syncBacklog: number;
    failureRate: number;
    recommendations: string[];
  }> {
    // Get all clients for organization
    const clients = await prisma.syncClient.findMany({
      where: {
        user: { organizationId },
        isActive: true
      },
      include: {
        _count: {
          select: {
            syncQueues: {
              where: {
                status: { in: ['PENDING', 'FAILED'] }
              }
            }
          }
        }
      }
    });

    // Calculate metrics
    const activeClients = clients.length;
    const totalBacklog = clients.reduce((sum, client) => 
      sum + client._count.syncQueues, 0
    );

    // Get failure rate
    const [totalItems, failedItems] = await prisma.$transaction([
      prisma.syncQueue.count({
        where: {
          client: {
            user: { organizationId }
          }
        }
      }),
      prisma.syncQueue.count({
        where: {
          client: {
            user: { organizationId }
          },
          status: 'FAILED'
        }
      })
    ]);

    const failureRate = totalItems > 0 ? (failedItems / totalItems) : 0;

    // Calculate health score (0-100)
    let healthScore = 100;
    if (totalBacklog > 100) healthScore -= 20;
    if (totalBacklog > 500) healthScore -= 30;
    if (failureRate > 0.1) healthScore -= 20;
    if (failureRate > 0.25) healthScore -= 30;

    // Generate recommendations
    const recommendations: string[] = [];
    if (totalBacklog > 100) {
      recommendations.push('High sync backlog detected. Consider increasing sync frequency.');
    }
    if (failureRate > 0.1) {
      recommendations.push('High failure rate. Check network connectivity and conflict resolution.');
    }
    if (activeClients === 0) {
      recommendations.push('No active sync clients. Ensure PWA is properly configured.');
    }

    return {
      healthScore: Math.max(0, healthScore),
      activeClients,
      syncBacklog: totalBacklog,
      failureRate,
      recommendations
    };
  }
}