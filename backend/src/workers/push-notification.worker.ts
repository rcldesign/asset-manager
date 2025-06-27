import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import {
  pushNotificationService,
  InvalidSubscriptionError,
} from '../services/push-notification.service';
import { logger } from '../utils/logger';
import type { PushNotificationJob } from '../lib/queue';

/**
 * Worker for processing push notification jobs
 * Handles sending push notifications to all subscribed devices for a user
 */
const pushNotificationWorker = new Worker<PushNotificationJob>(
  'push-notifications',
  async (job: Job<PushNotificationJob>) => {
    const { userId, payload } = job.data;
    const startTime = Date.now();

    logger.info('Processing push notification job', {
      jobId: job.id,
      userId,
      title: payload.title,
    });

    try {
      // Fetch all push subscriptions for the user
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId },
      });

      if (subscriptions.length === 0) {
        logger.debug(`No push subscriptions found for user ${userId}`);
        return {
          sent: 0,
          failed: 0,
          message: 'No push subscriptions found',
        };
      }

      logger.info(`Found ${subscriptions.length} push subscriptions for user ${userId}`);

      // Send notification to each subscription
      const results = await Promise.allSettled(
        subscriptions.map(async (subscription) => {
          try {
            await pushNotificationService.sendNotification(subscription, payload);
            return { subscriptionId: subscription.id, success: true };
          } catch (error) {
            if (error instanceof InvalidSubscriptionError) {
              // Delete invalid subscription
              logger.info(`Deleting invalid subscription ${subscription.id} for user ${userId}`);
              await prisma.pushSubscription
                .delete({
                  where: { id: subscription.id },
                })
                .catch((deleteError) => {
                  logger.error(
                    'Failed to delete invalid subscription',
                    deleteError instanceof Error ? deleteError : new Error('Unknown error'),
                  );
                });
            }
            return { subscriptionId: subscription.id, success: false, error };
          }
        }),
      );

      // Count successes and failures
      const successCount = results.filter(
        (result) => result.status === 'fulfilled' && result.value.success,
      ).length;
      const failureCount = results.length - successCount;

      const duration = Date.now() - startTime;

      logger.info('Push notification job completed', {
        jobId: job.id,
        userId,
        sent: successCount,
        failed: failureCount,
        total: subscriptions.length,
        duration,
      });

      return {
        sent: successCount,
        failed: failureCount,
        total: subscriptions.length,
      };
    } catch (error) {
      logger.error(
        'Failed to process push notification job',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          jobId: job.id,
          userId,
        },
      );
      throw error;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 5, // Process up to 5 jobs concurrently
    autorun: true,
  },
);

// Worker event handlers
pushNotificationWorker.on('completed', (job) => {
  logger.debug('Push notification job completed', {
    jobId: job.id,
    returnValue: job.returnvalue,
  });
});

pushNotificationWorker.on('failed', (job, error) => {
  logger.error('Push notification job failed', error, {
    jobId: job?.id,
  });
});

pushNotificationWorker.on('error', (error) => {
  logger.error('Push notification worker error', error);
});

logger.info('Push notification worker started');

export { pushNotificationWorker };
