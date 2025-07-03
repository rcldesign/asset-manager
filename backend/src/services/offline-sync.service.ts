import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import type {
  SyncClient,
  SyncMetadata,
  ConflictResolution,
  SyncOperation,
  PrismaClient,
} from '@prisma/client';
import crypto from 'crypto';
import { AppError } from '../utils/errors';
import { webhookService } from './webhook.service';
import type { SyncCompletedPayload } from '../types/webhook-payloads';

export interface SyncRequest {
  deviceId: string;
  deviceName?: string;
  syncToken?: string;
  changes: SyncChange[];
}

export interface SyncChange {
  entityType: string;
  entityId: string;
  operation: SyncOperation;
  payload: any;
  clientVersion: number;
  timestamp: string;
}

export interface SyncResponse {
  syncToken: string;
  changes: SyncChange[];
  conflicts: SyncConflict[];
  serverTime: string;
}

export interface SyncConflict {
  entityType: string;
  entityId: string;
  clientVersion: number;
  serverVersion: number;
  clientData: any;
  serverData: any;
  suggestedResolution: ConflictResolution;
}

export class OfflineSyncService {
  private prisma: PrismaClient;
  private readonly SYNC_BATCH_SIZE = 100;
  private readonly MAX_RETRY_COUNT = 3;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }

  /**
   * Register or update a sync client
   */
  async registerClient(userId: string, deviceId: string, deviceName?: string): Promise<SyncClient> {
    return await this.prisma.syncClient.upsert({
      where: {
        userId_deviceId: {
          userId,
          deviceId,
        },
      },
      update: {
        deviceName,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId,
        deviceId,
        deviceName,
        isActive: true,
      },
    });
  }

  /**
   * Process sync request from a PWA client
   */
  async processSync(userId: string, syncRequest: SyncRequest): Promise<SyncResponse> {
    const { deviceId, deviceName, syncToken, changes } = syncRequest;

    // Register/update client
    const client = await this.registerClient(userId, deviceId, deviceName);

    // Process incoming changes
    const conflicts: SyncConflict[] = [];

    for (const change of changes) {
      try {
        const conflict = await this.processClientChange(client.id, userId, change);
        if (conflict) {
          conflicts.push(conflict);
        }
      } catch (error) {
        logger.error('Error processing sync change', { change, error });
        // Add to conflict list if processing fails
        conflicts.push({
          entityType: change.entityType,
          entityId: change.entityId,
          clientVersion: change.clientVersion,
          serverVersion: 0,
          clientData: change.payload,
          serverData: null,
          suggestedResolution: 'SERVER_WINS' as ConflictResolution,
        });
      }
    }

    // Get server changes since last sync
    const serverChanges = await this.getServerChanges(client, userId, syncToken);

    // Generate new sync token
    const newSyncToken = this.generateSyncToken();

    // Update client sync status
    const syncEndTime = new Date();

    await this.prisma.syncClient.update({
      where: { id: client.id },
      data: {
        lastSyncAt: syncEndTime,
        syncToken: newSyncToken,
      },
    });

    // Emit webhook event for sync completion
    try {
      const syncStartTime = new Date(syncEndTime.getTime() - 5000); // Estimate sync duration

      const payload: SyncCompletedPayload = {
        sync: {
          id: `sync-${client.id}-${Date.now()}`,
          deviceId: client.deviceId,
          deviceName: client.deviceName || undefined,
          syncToken: newSyncToken,
          startedAt: syncStartTime,
          completedAt: syncEndTime,
        },
        user: {
          id: userId,
          email: '', // Will be populated by createEnhancedEvent
          name: '', // Will be populated by createEnhancedEvent
          role: 'VIEWER', // Default role, will be updated by createEnhancedEvent
        },
        summary: {
          uploaded: changes.length,
          downloaded: serverChanges.length,
          conflicts: conflicts.length,
          conflictResolution: conflicts.length > 0 ? conflicts[0].suggestedResolution : undefined,
        },
      };

      // Get organizationId from user
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });

      if (user?.organizationId) {
        const enhancedEvent = await webhookService.createEnhancedEvent(
          'sync.completed',
          user.organizationId,
          userId,
          payload,
        );

        await webhookService.emitEvent(enhancedEvent);
      }
    } catch (error) {
      logger.error('Failed to emit sync webhook event:', error);
    }

    return {
      syncToken: newSyncToken,
      changes: serverChanges,
      conflicts,
      serverTime: syncEndTime.toISOString(),
    };
  }

  /**
   * Process a single change from the client (public method for worker)
   */
  async processClientChange(
    clientId: string,
    userId: string,
    change: SyncChange,
  ): Promise<SyncConflict | null> {
    const { entityType, entityId, operation, payload, clientVersion } = change;

    // Add to sync queue
    const queueItem = await this.prisma.syncQueue.create({
      data: {
        clientId,
        entityType,
        entityId,
        operation,
        payload,
        clientVersion,
        status: 'SYNCING',
      },
    });

    try {
      // Check for conflicts
      const conflict = await this.detectConflict(entityType, entityId, clientVersion, payload);

      if (conflict) {
        // Update queue item with conflict
        await this.prisma.syncQueue.update({
          where: { id: queueItem.id },
          data: {
            status: 'CONFLICT',
            conflictData: conflict,
          },
        });

        // Store conflict for resolution
        await this.prisma.syncConflict.create({
          data: {
            entityType,
            entityId,
            clientVersion,
            serverVersion: conflict.serverVersion,
            clientData: payload,
            serverData: conflict.serverData,
            resolution: conflict.suggestedResolution,
          },
        });

        return conflict;
      }

      // Apply the change
      await this.applyChange(userId, entityType, entityId, operation, payload);

      // Update sync metadata
      await this.updateSyncMetadata(entityType, entityId, clientVersion + 1, userId, clientId);

      // Mark as completed
      await this.prisma.syncQueue.update({
        where: { id: queueItem.id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
        },
      });

      return null;
    } catch (error) {
      // Mark as failed
      await this.prisma.syncQueue.update({
        where: { id: queueItem.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          retryCount: { increment: 1 },
        },
      });
      throw error;
    }
  }

  /**
   * Detect conflicts between client and server data
   */
  private async detectConflict(
    entityType: string,
    entityId: string,
    clientVersion: number,
    clientData: any,
  ): Promise<SyncConflict | null> {
    // Get current server metadata
    const metadata = await this.prisma.syncMetadata.findUnique({
      where: {
        entityType_entityId: {
          entityType,
          entityId,
        },
      },
    });

    if (!metadata) {
      // New entity, no conflict
      return null;
    }

    // Check if versions match
    if (metadata.version === clientVersion) {
      // No conflict
      return null;
    }

    // Get current server data
    const serverData = await this.getEntityData(entityType, entityId);

    // Determine conflict resolution strategy
    const resolution = this.determineConflictResolution(
      entityType,
      clientData,
      serverData,
      metadata,
    );

    return {
      entityType,
      entityId,
      clientVersion,
      serverVersion: metadata.version,
      clientData,
      serverData,
      suggestedResolution: resolution,
    };
  }

  /**
   * Determine conflict resolution strategy
   */
  private determineConflictResolution(
    entityType: string,
    clientData: any,
    serverData: any,
    metadata: SyncMetadata,
  ): ConflictResolution {
    // If server data was modified more recently, suggest server wins
    const clientTimestamp = new Date(clientData.updatedAt || clientData.timestamp);
    const serverTimestamp = metadata.lastModifiedAt;

    if (serverTimestamp > clientTimestamp) {
      return 'SERVER_WINS';
    }

    // For certain entity types, prefer merging
    if (entityType === 'task' && this.canMergeTasks(clientData, serverData)) {
      return 'MERGE';
    }

    // Default to client wins for user-initiated changes
    return 'CLIENT_WINS';
  }

  /**
   * Check if two task objects can be merged
   */
  private canMergeTasks(clientData: any, serverData: any): boolean {
    // Simple merge strategy: different fields were updated
    const clientFields = Object.keys(clientData);
    const serverFields = Object.keys(serverData);

    // Check if fields don't overlap (except common fields)
    const commonFields = ['id', 'updatedAt', 'createdAt'];
    const clientChangedFields = clientFields.filter((f) => !commonFields.includes(f));
    const serverChangedFields = serverFields.filter((f) => !commonFields.includes(f));

    const overlap = clientChangedFields.filter((f) => serverChangedFields.includes(f));

    return overlap.length === 0;
  }

  /**
   * Apply a change to the database
   */
  private async applyChange(
    userId: string,
    entityType: string,
    entityId: string,
    operation: SyncOperation,
    payload: any,
  ): Promise<void> {
    // Validate user has permission to modify this entity
    await this.validatePermission(userId, entityType, entityId, operation);

    switch (entityType) {
      case 'asset':
        await this.applyAssetChange(entityId, operation, payload);
        break;
      case 'task':
        await this.applyTaskChange(entityId, operation, payload);
        break;
      case 'schedule':
        await this.applyScheduleChange(entityId, operation, payload);
        break;
      default:
        throw new AppError(`Unsupported entity type: ${entityType}`, 400);
    }
  }

  /**
   * Apply changes to assets
   */
  private async applyAssetChange(
    entityId: string,
    operation: SyncOperation,
    payload: any,
  ): Promise<void> {
    switch (operation) {
      case 'CREATE':
        await this.prisma.asset.create({
          data: {
            id: entityId,
            ...payload,
          },
        });
        break;
      case 'UPDATE':
        await this.prisma.asset.update({
          where: { id: entityId },
          data: payload,
        });
        break;
      case 'DELETE':
        await this.prisma.asset.delete({
          where: { id: entityId },
        });
        break;
    }
  }

  /**
   * Apply changes to tasks
   */
  private async applyTaskChange(
    entityId: string,
    operation: SyncOperation,
    payload: any,
  ): Promise<void> {
    switch (operation) {
      case 'CREATE':
        await this.prisma.task.create({
          data: {
            id: entityId,
            ...payload,
          },
        });
        break;
      case 'UPDATE':
        await this.prisma.task.update({
          where: { id: entityId },
          data: payload,
        });
        break;
      case 'DELETE':
        await this.prisma.task.delete({
          where: { id: entityId },
        });
        break;
    }
  }

  /**
   * Apply changes to schedules
   */
  private async applyScheduleChange(
    entityId: string,
    operation: SyncOperation,
    payload: any,
  ): Promise<void> {
    switch (operation) {
      case 'CREATE':
        await this.prisma.schedule.create({
          data: {
            id: entityId,
            ...payload,
          },
        });
        break;
      case 'UPDATE':
        await this.prisma.schedule.update({
          where: { id: entityId },
          data: payload,
        });
        break;
      case 'DELETE':
        await this.prisma.schedule.delete({
          where: { id: entityId },
        });
        break;
    }
  }

  /**
   * Get server changes since last sync
   */
  private async getServerChanges(
    client: SyncClient,
    userId: string,
    syncToken?: string,
  ): Promise<SyncChange[]> {
    const changes: SyncChange[] = [];
    const lastSyncTime = client.lastSyncAt || new Date(0);

    // Get all entities modified since last sync
    const modifiedEntities = await this.prisma.syncMetadata.findMany({
      where: {
        lastModifiedAt: {
          gt: lastSyncTime,
        },
        OR: [{ clientId: { not: client.id } }, { clientId: null }],
      },
      take: this.SYNC_BATCH_SIZE,
      orderBy: {
        lastModifiedAt: 'asc',
      },
    });

    for (const metadata of modifiedEntities) {
      // Get entity data
      const entityData = await this.getEntityData(metadata.entityType, metadata.entityId);

      if (entityData) {
        // Check permission
        const hasPermission = await this.checkPermission(
          userId,
          metadata.entityType,
          metadata.entityId,
          'READ',
        );

        if (hasPermission) {
          changes.push({
            entityType: metadata.entityType,
            entityId: metadata.entityId,
            operation: metadata.deletedAt ? 'DELETE' : 'UPDATE',
            payload: entityData,
            clientVersion: metadata.version,
            timestamp: metadata.lastModifiedAt.toISOString(),
          });
        }
      }
    }

    return changes;
  }

  /**
   * Get entity data by type and ID
   */
  private async getEntityData(entityType: string, entityId: string): Promise<any> {
    switch (entityType) {
      case 'asset':
        return await this.prisma.asset.findUnique({
          where: { id: entityId },
        });
      case 'task':
        return await this.prisma.task.findUnique({
          where: { id: entityId },
          include: {
            taskAssignments: true,
            taskComments: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        });
      case 'schedule':
        return await this.prisma.schedule.findUnique({
          where: { id: entityId },
        });
      default:
        return null;
    }
  }

  /**
   * Update sync metadata for an entity
   */
  private async updateSyncMetadata(
    entityType: string,
    entityId: string,
    version: number,
    userId: string,
    clientId?: string,
  ): Promise<void> {
    const checksum = this.calculateChecksum({ entityType, entityId, version });

    await this.prisma.syncMetadata.upsert({
      where: {
        entityType_entityId: {
          entityType,
          entityId,
        },
      },
      update: {
        version,
        lastModifiedBy: userId,
        lastModifiedAt: new Date(),
        checksum,
        clientId,
        deletedAt: null,
      },
      create: {
        entityType,
        entityId,
        version,
        lastModifiedBy: userId,
        checksum,
        clientId,
      },
    });
  }

  /**
   * Validate user permission for an operation
   */
  private async validatePermission(
    userId: string,
    entityType: string,
    entityId: string,
    operation: SyncOperation,
  ): Promise<void> {
    const hasPermission = await this.checkPermission(userId, entityType, entityId, operation);

    if (!hasPermission) {
      throw new AppError(
        `User ${userId} does not have permission to ${operation} ${entityType} ${entityId}`,
        403,
      );
    }
  }

  /**
   * Check user permission for an entity
   */
  private async checkPermission(
    userId: string,
    entityType: string,
    entityId: string,
    operation: SyncOperation | 'READ',
  ): Promise<boolean> {
    // Get user and their organization
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      return false;
    }

    // Check entity belongs to user's organization
    switch (entityType) {
      case 'asset':
        const asset = await this.prisma.asset.findUnique({
          where: { id: entityId },
        });
        return asset?.organizationId === user.organizationId;

      case 'task':
        const task = await this.prisma.task.findUnique({
          where: { id: entityId },
        });
        return task?.organizationId === user.organizationId;

      case 'schedule':
        const schedule = await this.prisma.schedule.findUnique({
          where: { id: entityId },
        });
        return schedule?.organizationId === user.organizationId;

      default:
        return false;
    }
  }

  /**
   * Generate a sync token
   */
  private generateSyncToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Calculate checksum for integrity checking
   */
  private calculateChecksum(data: any): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  /**
   * Resolve a conflict manually
   */
  async resolveConflict(
    conflictId: string,
    resolution: ConflictResolution,
    resolvedBy: string,
  ): Promise<void> {
    const conflict = await this.prisma.syncConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) {
      throw new AppError('Conflict not found', 404);
    }

    // Apply resolution
    switch (resolution) {
      case 'CLIENT_WINS':
        await this.applyChange(
          resolvedBy,
          conflict.entityType,
          conflict.entityId,
          'UPDATE',
          conflict.clientData,
        );
        break;

      case 'SERVER_WINS':
        // No action needed, server data remains
        break;

      case 'MERGE':
        // Merge logic would go here
        const mergedData = this.mergeData(conflict.clientData, conflict.serverData);
        await this.applyChange(
          resolvedBy,
          conflict.entityType,
          conflict.entityId,
          'UPDATE',
          mergedData,
        );
        break;
    }

    // Update conflict record
    await this.prisma.syncConflict.update({
      where: { id: conflictId },
      data: {
        resolution,
        resolvedBy,
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Merge two data objects
   */
  private mergeData(clientData: any, serverData: any): any {
    // Simple merge strategy: take non-conflicting fields from both
    const merged = { ...serverData };

    for (const [key, value] of Object.entries(clientData)) {
      if (!(key in serverData) || serverData[key] === null) {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Clean up old sync data
   */
  async cleanupOldSyncData(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // Delete old completed sync queue items
    await this.prisma.syncQueue.deleteMany({
      where: {
        status: 'COMPLETED',
        processedAt: {
          lt: cutoffDate,
        },
      },
    });

    // Delete old resolved conflicts
    await this.prisma.syncConflict.deleteMany({
      where: {
        resolvedAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info('Cleaned up old sync data', { cutoffDate });
  }

  /**
   * Get sync statistics for monitoring
   */
  async getSyncStats(organizationId: string): Promise<any> {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      select: { id: true },
    });

    const userIds = users.map((u) => u.id);

    const stats = await this.prisma.$transaction([
      this.prisma.syncClient.count({
        where: {
          userId: { in: userIds },
          isActive: true,
        },
      }),
      this.prisma.syncQueue.groupBy({
        by: ['status'],
        where: {
          client: {
            userId: { in: userIds },
          },
        },
        _count: true,
      }),
      this.prisma.syncConflict.count({
        where: {
          resolvedAt: null,
        },
      }),
    ]);

    return {
      activeClients: stats[0],
      queueStatus: stats[1],
      unresolvedConflicts: stats[2],
    };
  }

  /**
   * Get delta changes for efficient sync
   */
  async getDeltaChanges(
    clientId: string,
    userId: string,
    options: {
      entityTypes?: string[];
      since?: Date;
      pageSize: number;
      pageToken?: string;
    },
  ): Promise<{
    changes: SyncChange[];
    nextPageToken?: string;
    hasMore: boolean;
  }> {
    const { entityTypes, since, pageSize, pageToken } = options;

    // Parse page token to get offset
    const offset = pageToken ? parseInt(pageToken, 10) : 0;

    // Build query conditions
    const whereConditions: any = {
      lastModifiedAt: since ? { gt: since } : undefined,
      entityType: entityTypes ? { in: entityTypes } : undefined,
      OR: [{ clientId: { not: clientId } }, { clientId: null }],
    };

    // Remove undefined values
    Object.keys(whereConditions).forEach((key) => {
      if (whereConditions[key] === undefined) {
        delete whereConditions[key];
      }
    });

    // Get changes
    const metadata = await this.prisma.syncMetadata.findMany({
      where: whereConditions,
      orderBy: { lastModifiedAt: 'asc' },
      skip: offset,
      take: pageSize + 1, // Get one extra to check if there are more
    });

    const hasMore = metadata.length > pageSize;
    const changes: SyncChange[] = [];

    // Process only pageSize items
    const itemsToProcess = metadata.slice(0, pageSize);

    for (const meta of itemsToProcess) {
      // Check permission
      const hasPermission = await this.checkPermission(
        userId,
        meta.entityType,
        meta.entityId,
        'READ',
      );

      if (hasPermission) {
        const entityData = await this.getEntityData(meta.entityType, meta.entityId);
        if (entityData || meta.deletedAt) {
          changes.push({
            entityType: meta.entityType,
            entityId: meta.entityId,
            operation: meta.deletedAt ? 'DELETE' : 'UPDATE',
            payload: entityData || {},
            clientVersion: meta.version,
            timestamp: meta.lastModifiedAt.toISOString(),
          });
        }
      }
    }

    return {
      changes,
      nextPageToken: hasMore ? String(offset + pageSize) : undefined,
      hasMore,
    };
  }

  /**
   * Get unresolved conflicts for a user
   */
  async getUnresolvedConflicts(
    userId: string,
    options: {
      entityType?: string;
      page: number;
      limit: number;
    },
  ): Promise<{
    conflicts: any[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { entityType, page, limit } = options;
    const offset = (page - 1) * limit;

    // Get user's organization
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Build query
    const whereConditions: any = {
      resolvedAt: null,
      entityType: entityType || undefined,
    };

    // Remove undefined values
    Object.keys(whereConditions).forEach((key) => {
      if (whereConditions[key] === undefined) {
        delete whereConditions[key];
      }
    });

    // Get conflicts and total count
    const [conflicts, total] = await this.prisma.$transaction([
      this.prisma.syncConflict.findMany({
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.syncConflict.count({ where: whereConditions }),
    ]);

    // Filter conflicts by permission
    const filteredConflicts = [];
    for (const conflict of conflicts) {
      const hasPermission = await this.checkPermission(
        userId,
        conflict.entityType,
        conflict.entityId,
        'UPDATE',
      );
      if (hasPermission) {
        filteredConflicts.push(conflict);
      }
    }

    return {
      conflicts: filteredConflicts,
      total,
      page,
      pageSize: limit,
    };
  }

  /**
   * Get user sync status
   */
  async getUserSyncStatus(userId: string): Promise<any> {
    const clients = await this.prisma.syncClient.findMany({
      where: { userId, isActive: true },
      include: {
        _count: {
          select: {
            syncQueues: {
              where: { status: { in: ['PENDING', 'FAILED'] } },
            },
          },
        },
      },
    });

    const conflicts = await this.prisma.syncConflict.count({
      where: {
        resolvedAt: null,
        // Add entity permission check here if needed
      },
    });

    return {
      devices: clients.map((client) => ({
        id: client.id,
        deviceId: client.deviceId,
        deviceName: client.deviceName,
        lastSyncAt: client.lastSyncAt,
        pendingChanges: client._count.syncQueues,
      })),
      unresolvedConflicts: conflicts,
    };
  }

  /**
   * Get user devices
   */
  async getUserDevices(userId: string): Promise<SyncClient[]> {
    return await this.prisma.syncClient.findMany({
      where: { userId },
      orderBy: { lastSyncAt: 'desc' },
    });
  }

  /**
   * Unregister a device
   */
  async unregisterDevice(userId: string, deviceId: string): Promise<void> {
    const client = await this.prisma.syncClient.findFirst({
      where: { userId, deviceId },
    });

    if (!client) {
      throw new AppError('Device not found', 404);
    }

    await this.prisma.syncClient.update({
      where: { id: client.id },
      data: { isActive: false },
    });
  }

  /**
   * Retry failed sync operations
   */
  async retryFailedSync(
    userId: string,
    deviceId: string,
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    const client = await this.prisma.syncClient.findFirst({
      where: { userId, deviceId, isActive: true },
    });

    if (!client) {
      throw new AppError('Device not found or inactive', 404);
    }

    // Get failed sync items
    const failedItems = await this.prisma.syncQueue.findMany({
      where: {
        clientId: client.id,
        status: 'FAILED',
        retryCount: { lt: this.MAX_RETRY_COUNT },
      },
    });

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const item of failedItems) {
      processed++;
      try {
        // Retry the sync operation
        await this.processClientChange(client.id, userId, {
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
          payload: item.payload,
          clientVersion: item.clientVersion,
          timestamp: new Date().toISOString(),
        });
        succeeded++;
      } catch (error) {
        failed++;
        logger.error('Failed to retry sync item', { itemId: item.id, error });
      }
    }

    return { processed, succeeded, failed };
  }

  /**
   * Invalidate cache for entities
   */
  async invalidateCache(
    userId: string,
    options: {
      entityType?: string;
      entityIds?: string[];
    },
  ): Promise<void> {
    const { entityType, entityIds } = options;

    if (entityIds && entityIds.length > 0) {
      // Invalidate specific entities
      for (const entityId of entityIds) {
        await this.updateSyncMetadata(
          entityType || 'unknown',
          entityId,
          0, // Force version update
          userId,
        );
      }
    } else if (entityType) {
      // Invalidate all entities of a type
      await this.prisma.syncMetadata.updateMany({
        where: { entityType },
        data: {
          lastModifiedAt: new Date(),
          lastModifiedBy: userId,
        },
      });
    }

    logger.info('Cache invalidated', { userId, entityType, entityIds });
  }
}
