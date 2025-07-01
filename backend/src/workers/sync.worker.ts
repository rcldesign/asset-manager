import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { logger } from '../utils/logger';
import { OfflineSyncService } from '../services/offline-sync.service';
import { prisma } from '../lib/prisma';
import type { SyncJob } from '../lib/queue';

const syncService = new OfflineSyncService();

/**
 * Process sync jobs from the queue
 */
async function processSyncJob(job: Job<SyncJob>): Promise<void> {
  const { type, clientId, itemIds, entityType, tag } = job.data;

  logger.info('Processing sync job', {
    jobId: job.id,
    type,
    clientId,
    itemCount: itemIds?.length || 0
  });

  try {
    switch (type) {
      case 'batch-sync':
        await processBatchSync(clientId, itemIds || []);
        break;

      case 'critical-sync':
        await processCriticalSync(clientId, itemIds || []);
        break;

      case 'type-sync':
        await processTypeSync(clientId, entityType || 'unknown', itemIds || []);
        break;

      case 'custom-sync':
        await processCustomSync(clientId, tag || 'unknown', itemIds || []);
        break;

      case 'retry-sync':
        await processRetrySync(clientId, itemIds || []);
        break;

      default:
        throw new Error(`Unknown sync job type: ${type}`);
    }

    logger.info('Sync job completed successfully', { jobId: job.id });
  } catch (error) {
    logger.error('Sync job failed', error instanceof Error ? error : undefined, {
      jobId: job.id
    });
    throw error;
  }
}

/**
 * Process batch sync for multiple items
 */
async function processBatchSync(clientId: string, itemIds: string[]): Promise<void> {
  // Get sync client info
  const client = await prisma.syncClient.findUnique({
    where: { id: clientId },
    include: { user: true }
  });

  if (!client) {
    throw new Error(`Sync client not found: ${clientId}`);
  }

  // Process items in batches
  const batchSize = 10;
  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (itemId) => {
        try {
          await processSyncItem(client.userId, itemId);
        } catch (error) {
          logger.error('Failed to process sync item', error instanceof Error ? error : undefined, {
            itemId
          });
        }
      })
    );
  }
}

/**
 * Process critical sync items with high priority
 */
async function processCriticalSync(clientId: string, itemIds: string[]): Promise<void> {
  const client = await prisma.syncClient.findUnique({
    where: { id: clientId },
    include: { user: true }
  });

  if (!client) {
    throw new Error(`Sync client not found: ${clientId}`);
  }

  // Process critical items immediately
  await Promise.all(
    itemIds.map(async (itemId) => {
      try {
        await processSyncItem(client.userId, itemId, true);
      } catch (error) {
        logger.error('Failed to process critical sync item', error instanceof Error ? error : undefined, {
          itemId
        });
        // Don't throw - continue processing other items
      }
    })
  );
}

/**
 * Process sync items by entity type
 */
async function processTypeSync(
  clientId: string,
  entityType: string,
  itemIds: string[]
): Promise<void> {
  const client = await prisma.syncClient.findUnique({
    where: { id: clientId },
    include: { user: true }
  });

  if (!client) {
    throw new Error(`Sync client not found: ${clientId}`);
  }

  logger.info('Processing type-specific sync', {
    clientId,
    entityType,
    itemCount: itemIds.length
  });

  // Process items of specific type
  for (const itemId of itemIds) {
    try {
      await processSyncItem(client.userId, itemId);
    } catch (error) {
      logger.error('Failed to process typed sync item', error instanceof Error ? error : undefined, {
        itemId,
        entityType
      });
    }
  }
}

/**
 * Process custom sync based on tag
 */
async function processCustomSync(
  clientId: string,
  tag: string,
  itemIds: string[]
): Promise<void> {
  const client = await prisma.syncClient.findUnique({
    where: { id: clientId },
    include: { user: true }
  });

  if (!client) {
    throw new Error(`Sync client not found: ${clientId}`);
  }

  logger.info('Processing custom sync', {
    clientId,
    tag,
    itemCount: itemIds.length
  });

  // Process custom sync items
  for (const itemId of itemIds) {
    try {
      await processSyncItem(client.userId, itemId);
    } catch (error) {
      logger.error('Failed to process custom sync item', error instanceof Error ? error : undefined, {
        itemId,
        tag
      });
    }
  }
}

/**
 * Retry failed sync items
 */
async function processRetrySync(clientId: string, itemIds: string[]): Promise<void> {
  const client = await prisma.syncClient.findUnique({
    where: { id: clientId },
    include: { user: true }
  });

  if (!client) {
    throw new Error(`Sync client not found: ${clientId}`);
  }

  logger.info('Retrying failed sync items', {
    clientId,
    itemCount: itemIds.length
  });

  for (const itemId of itemIds) {
    try {
      await processSyncItem(client.userId, itemId, false);
    } catch (error) {
      logger.error('Failed to retry sync item', error instanceof Error ? error : undefined, {
        itemId
      });
    }
  }
}

/**
 * Process a single sync queue item
 */
async function processSyncItem(
  userId: string,
  itemId: string,
  isCritical: boolean = false
): Promise<void> {
  const item = await prisma.syncQueue.findUnique({
    where: { id: itemId },
    include: { client: true }
  });

  if (!item) {
    logger.warn('Sync queue item not found', { itemId });
    return;
  }

  if (item.status === 'COMPLETED') {
    logger.debug('Sync item already completed', { itemId });
    return;
  }

  try {
    // Update status to syncing
    await prisma.syncQueue.update({
      where: { id: itemId },
      data: { status: 'SYNCING' }
    });

    // Process the sync change
    const conflict = await syncService.processClientChange(
      item.clientId,
      userId,
      {
        entityType: item.entityType,
        entityId: item.entityId,
        operation: item.operation,
        payload: item.payload,
        clientVersion: item.clientVersion,
        timestamp: item.createdAt.toISOString()
      }
    );

    if (conflict) {
      // Handle conflict
      await prisma.syncQueue.update({
        where: { id: itemId },
        data: {
          status: 'CONFLICT',
          conflictData: conflict as any
        }
      });

      logger.warn('Sync conflict detected', {
        itemId,
        entityType: item.entityType,
        entityId: item.entityId
      });
    } else {
      // Mark as completed
      await prisma.syncQueue.update({
        where: { id: itemId },
        data: {
          status: 'COMPLETED',
          processedAt: new Date()
        }
      });

      logger.debug('Sync item processed successfully', { itemId });
    }
  } catch (error) {
    // Update retry count and status
    const retryCount = item.retryCount + 1;
    const maxRetries = isCritical ? 5 : 3;

    await prisma.syncQueue.update({
      where: { id: itemId },
      data: {
        status: retryCount >= maxRetries ? 'FAILED' : 'PENDING',
        retryCount,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    logger.error('Failed to process sync item', error instanceof Error ? error : undefined, {
      itemId,
      retryCount
    });

    if (retryCount >= maxRetries) {
      // Notify about permanent failure
      await notifySyncFailure(userId, item);
    }

    throw error;
  }
}

/**
 * Notify user about sync failure
 */
async function notifySyncFailure(userId: string, item: any): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return;

    await prisma.notification.create({
      data: {
        userId,
        organizationId: user.organizationId,
        type: 'sync_failed',
        title: 'Sync Failed',
        message: `Failed to sync ${item.entityType} after multiple attempts. Please check your connection and try again.`,
        data: {
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation
        }
      }
    });
  } catch (error) {
    logger.error('Failed to create sync failure notification', error instanceof Error ? error : undefined, {
      userId,
      itemId: item.id
    });
  }
}

// Create and export the worker
export const syncWorker = new Worker<SyncJob>(
  'sync',
  processSyncJob,
  {
    connection: createRedisConnection(),
    concurrency: 5,
    lockDuration: 60000, // 1 minute
    lockRenewTime: 30000, // 30 seconds
  }
);

// Worker event handlers
syncWorker.on('completed', (job) => {
  logger.debug('Sync job completed', { jobId: job.id });
});

syncWorker.on('failed', (job, error) => {
  logger.error('Sync job failed', error, {
    jobId: job?.id
  });
});

syncWorker.on('error', (error) => {
  logger.error('Sync worker error', error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing sync worker...');
  await syncWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing sync worker...');
  await syncWorker.close();
  process.exit(0);
});