import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { Prisma } from '@prisma/client';
import { createRedisConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import type { ActivityEventPayload } from '../types/activity';

/**
 * Activity Worker
 *
 * Processes activity events from the activity queue and persists them to the database.
 * Implements idempotency using eventId to handle retries safely.
 */
const activityWorkerProcessor = async (job: Job<ActivityEventPayload>) => {
  const event = job.data;

  try {
    // The worker's main job: transform the payload and persist it.
    await prisma.activity.create({
      data: {
        eventId: event.eventId,
        organizationId: event.organizationId,
        actorType: event.actor.type,
        actorId: event.actor.id,
        actorName: event.actor.name,
        verb: event.verb,
        objectType: event.object.type,
        objectId: event.object.id,
        objectDisplayName: event.object.displayName,
        targetType: event.target?.type,
        targetId: event.target?.id,
        targetDisplayName: event.target?.displayName,
        metadata: event.metadata ?? Prisma.JsonNull,
        timestamp: new Date(event.timestamp), // Use the event's timestamp
      },
    });

    logger.debug(`Processed activity event: ${event.eventId}`, {
      eventId: event.eventId,
      verb: event.verb,
      objectType: event.object.type,
      actorId: event.actor.id,
    });
  } catch (error) {
    // Check if the error is a Prisma unique constraint violation
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // The unique constraint on `eventId` was violated.
      // This means we've already processed this event.
      logger.debug(`Ignoring duplicate activity event: ${event.eventId}`, {
        eventId: event.eventId,
        verb: event.verb,
        objectType: event.object.type,
      });
      // Acknowledge the job as successfully completed.
      return;
    }

    // For any other error, re-throw it so BullMQ can retry the job.
    logger.error(
      `Failed to process activity event ${event.eventId}:`,
      error instanceof Error ? error : new Error('Unknown error'),
      {
        eventId: event.eventId,
        verb: event.verb,
        objectType: event.object.type,
      },
    );
    throw error;
  }
};

// Create the activity worker
export const activityWorker = new Worker('activities', activityWorkerProcessor, {
  connection: createRedisConnection(),
  concurrency: 5, // Process up to 5 activity events concurrently
  maxStalledCount: 3,
  stalledInterval: 30000,
});

// Worker event handlers
activityWorker.on('completed', (job: Job) => {
  logger.debug(`Activity worker completed job ${job.id}`, {
    eventId: job.data?.eventId,
    verb: job.data?.verb,
  });
});

activityWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error(`Activity worker failed job ${job?.id}:`, err, {
    eventId: job?.data?.eventId,
    verb: job?.data?.verb,
  });
});

activityWorker.on('stalled', (jobId: string) => {
  logger.warn(`Activity worker job ${jobId} stalled`);
});

activityWorker.on('error', (err: Error) => {
  logger.error('Activity worker error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down activity worker...');
  await activityWorker.close();
  logger.info('Activity worker shut down');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down activity worker...');
  await activityWorker.close();
  logger.info('Activity worker shut down');
  process.exit(0);
});

export default activityWorker;
