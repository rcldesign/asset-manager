import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { logger } from '../utils/logger';
import type { WebhookJob } from '../lib/queue';
import { webhookService } from '../services/webhook.service';
import { prisma } from '../lib/prisma';

export const webhookWorker = new Worker<WebhookJob>(
  'webhooks',
  async (job: Job<WebhookJob>) => {
    const { webhookId, event } = job.data;

    try {
      logger.info('Processing webhook delivery', {
        webhookId,
        eventType: event.type,
        eventId: event.id,
      });

      await job.updateProgress(20);

      // Deliver the webhook
      const delivery = await webhookService.deliverWebhook(webhookId, {
        ...event,
        type: event.type as any, // Type assertion needed due to WebhookEventType constraint
      });

      await job.updateProgress(80);

      if (delivery.status === 'failed' && delivery.nextRetryAt) {
        // Calculate delay for retry
        const retryDelay = delivery.nextRetryAt.getTime() - Date.now();

        if (retryDelay > 0) {
          // Update delivery status to indicate retry is scheduled
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'pending',
              nextRetryAt: delivery.nextRetryAt,
            },
          });

          // Throw error to trigger retry with backoff
          throw new Error(
            `Webhook delivery failed, will retry at ${delivery.nextRetryAt.toISOString()}`,
          );
        }
      }

      await job.updateProgress(100);

      logger.info('Webhook delivery completed', {
        webhookId,
        eventType: event.type,
        status: delivery.status,
      });

      return {
        deliveryId: delivery.id,
        status: delivery.status,
        statusCode: delivery.statusCode,
      };
    } catch (error) {
      logger.error(
        'Webhook delivery failed',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          webhookId,
          eventType: event.type,
        },
      );

      // Update attempt count if delivery record exists
      try {
        const existingDelivery = await prisma.webhookDelivery.findFirst({
          where: {
            webhookId,
            eventId: event.id,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingDelivery) {
          await prisma.webhookDelivery.update({
            where: { id: existingDelivery.id },
            data: {
              attemptCount: { increment: 1 },
              lastAttemptAt: new Date(),
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      } catch (updateError) {
        logger.error(
          'Failed to update delivery record',
          updateError instanceof Error ? updateError : new Error('Unknown error'),
        );
      }

      throw error;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 10, // Process up to 10 webhooks concurrently
    limiter: {
      max: 100,
      duration: 60000, // Max 100 webhook deliveries per minute
    },
  },
);

// Worker event handlers
webhookWorker.on('completed', (job) => {
  logger.debug(`Webhook delivery job ${job.id} completed`);
});

webhookWorker.on('failed', (job, err) => {
  logger.error(`Webhook delivery job ${job?.id} failed`, err);
});

webhookWorker.on('stalled', (jobId) => {
  logger.warn(`Webhook delivery job ${jobId} stalled`);
});

// Graceful shutdown
export async function closeWebhookWorker(): Promise<void> {
  await webhookWorker.close();
  logger.info('Webhook worker closed');
}
