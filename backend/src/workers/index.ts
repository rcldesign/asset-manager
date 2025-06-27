import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { logger } from '../utils/logger';
import type {
  EmailJob,
  NotificationJob,
  MaintenanceTaskJob,
  ReportJob,
  ScheduleJob,
} from '../lib/queue';

// Import worker processors
import { processEmailJob } from './email.worker';
import { processNotificationJob } from './notification.worker';
import { processMaintenanceJob } from './maintenance.worker';
import { processReportJob } from './report.worker';
import { processScheduleJob } from './schedule.worker';
import { activityWorker } from './activity.worker';
import { pushNotificationWorker } from './push-notification.worker';
import { webhookWorker } from './webhook.worker';

// Worker instances
const emailWorker = new Worker(
  'email',
  async (job: Job<EmailJob>) => {
    return processEmailJob(job);
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 50 },
  },
);

const notificationWorker = new Worker(
  'notifications',
  async (job: Job<NotificationJob>) => {
    return processNotificationJob(job);
  },
  {
    connection: createRedisConnection(),
    concurrency: 3,
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 50 },
  },
);

const maintenanceWorker = new Worker(
  'maintenance-tasks',
  async (job: Job<MaintenanceTaskJob>) => {
    return processMaintenanceJob(job);
  },
  {
    connection: createRedisConnection(),
    concurrency: 2,
    removeOnComplete: { count: 5 },
    removeOnFail: { count: 25 },
  },
);

const reportWorker = new Worker(
  'reports',
  async (job: Job<ReportJob>) => {
    return processReportJob(job);
  },
  {
    connection: createRedisConnection(),
    concurrency: 1, // Reports are CPU intensive, so limit concurrency
    removeOnComplete: { count: 5 },
    removeOnFail: { count: 10 },
  },
);

const scheduleWorker = new Worker(
  'schedules',
  async (job: Job<ScheduleJob>) => {
    return processScheduleJob(job);
  },
  {
    connection: createRedisConnection(),
    concurrency: 5, // Process up to 5 schedule jobs concurrently
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 25 },
  },
);

// Worker event handlers
const workers = [
  { name: 'email', worker: emailWorker },
  { name: 'notifications', worker: notificationWorker },
  { name: 'maintenance-tasks', worker: maintenanceWorker },
  { name: 'reports', worker: reportWorker },
  { name: 'schedules', worker: scheduleWorker },
  { name: 'activities', worker: activityWorker },
  { name: 'push-notifications', worker: pushNotificationWorker },
  { name: 'webhooks', worker: webhookWorker },
];

workers.forEach(({ name, worker }) => {
  worker.on('completed', (job: Job) => {
    logger.info(`Worker ${name}: Job ${job.id} completed`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`Worker ${name}: Job ${job?.id || 'unknown'} failed`, err);
  });

  worker.on('error', (err: Error) => {
    logger.error(`Worker ${name}: Worker error`, err);
  });

  worker.on('stalled', (jobId: string) => {
    logger.warn(`Worker ${name}: Job ${jobId} stalled`);
  });

  worker.on('progress', (job: Job, progress: unknown) => {
    logger.debug(
      `Worker ${name}: Job ${job.id} progress`,
      typeof progress === 'object' && progress !== null
        ? (progress as Record<string, unknown>)
        : { progress },
    );
  });
});

// Health check for workers
export function getWorkerHealth(): {
  workers: Array<{
    name: string;
    isRunning: boolean;
    isClosing: boolean;
    concurrency: number;
  }>;
} {
  return {
    workers: workers.map(({ name, worker }) => ({
      name,
      isRunning: worker.isRunning(),
      isClosing: Boolean(worker.closing),
      concurrency: worker.opts.concurrency || 1,
    })),
  };
}

// Graceful shutdown of all workers
export async function closeAllWorkers(): Promise<void> {
  logger.info('Shutting down all workers...');

  await Promise.all(workers.map(({ worker }) => worker.close()));

  logger.info('All workers shut down successfully');
}

// Export individual workers
export {
  emailWorker,
  notificationWorker,
  maintenanceWorker,
  reportWorker,
  scheduleWorker,
  activityWorker,
  pushNotificationWorker,
  webhookWorker,
};
