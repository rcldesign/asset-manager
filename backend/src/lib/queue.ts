import { Queue, QueueEvents, type Job } from 'bullmq';
import { createRedisConnection } from './redis';
import { logger } from '../utils/logger';

// Create shared Redis connection for queues
const queueConnection = createRedisConnection();

// Queue definitions with BullMQ
export const emailQueue = new Queue('email', {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const notificationQueue = new Queue('notifications', {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const maintenanceQueue = new Queue('maintenance-tasks', {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 25,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export const reportQueue = new Queue('reports', {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 10,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  },
});

// Queue Events for monitoring
export const emailQueueEvents = new QueueEvents('email', {
  connection: createRedisConnection(),
});
export const notificationQueueEvents = new QueueEvents('notifications', {
  connection: createRedisConnection(),
});
export const maintenanceQueueEvents = new QueueEvents('maintenance-tasks', {
  connection: createRedisConnection(),
});
export const reportQueueEvents = new QueueEvents('reports', {
  connection: createRedisConnection(),
});

// Job type definitions
export interface EmailJob {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  templateData?: Record<string, unknown>;
}

export interface NotificationJob {
  type: 'asset-warranty-expiring' | 'task-due' | 'task-overdue' | 'welcome-user' | 'password-reset';
  userId?: string;
  assetId?: string;
  taskId?: string;
  organizationId?: string;
  data?: Record<string, unknown>;
}

export interface MaintenanceTaskJob {
  type:
    | 'generate-recurring-tasks'
    | 'check-asset-warranties'
    | 'cleanup-expired-sessions'
    | 'backup-data';
  assetId?: string;
  organizationId?: string;
  scheduleId?: string;
  data?: Record<string, unknown>;
}

export interface ReportJob {
  type: 'asset-report' | 'maintenance-report' | 'cost-analysis' | 'usage-statistics';
  userId: string;
  organizationId: string;
  reportParams: Record<string, unknown>;
  format: 'pdf' | 'csv' | 'xlsx';
}

// Queue helper functions
export async function addEmailJob(
  data: EmailJob,
  options?: { delay?: number; priority?: number },
): Promise<Job> {
  return emailQueue.add('send-email', data, {
    delay: options?.delay,
    priority: options?.priority,
  });
}

export async function addNotificationJob(
  data: NotificationJob,
  options?: { delay?: number; priority?: number },
): Promise<Job> {
  return notificationQueue.add('process-notification', data, {
    delay: options?.delay,
    priority: options?.priority,
  });
}

export async function addMaintenanceJob(
  data: MaintenanceTaskJob,
  options?: { delay?: number; repeat?: { pattern: string } },
): Promise<Job> {
  return maintenanceQueue.add('maintenance-task', data, {
    delay: options?.delay,
    repeat: options?.repeat,
  });
}

export async function addReportJob(data: ReportJob, options?: { delay?: number }): Promise<Job> {
  return reportQueue.add('generate-report', data, {
    delay: options?.delay,
  });
}

// Queue event handlers for logging
const allQueueEvents = [
  emailQueueEvents,
  notificationQueueEvents,
  maintenanceQueueEvents,
  reportQueueEvents,
];

allQueueEvents.forEach((queueEvents, index) => {
  const queueNames = ['email', 'notifications', 'maintenance-tasks', 'reports'];
  const queueName = queueNames[index];

  queueEvents.on('completed', ({ jobId }: { jobId: string }) => {
    logger.debug(`Job ${jobId} completed in queue ${queueName}`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
    logger.error(`Job ${jobId} failed in queue ${queueName}: ${failedReason}`);
  });

  queueEvents.on('stalled', ({ jobId }: { jobId: string }) => {
    logger.warn(`Job ${jobId} stalled in queue ${queueName}`);
  });

  queueEvents.on('progress', ({ jobId, data }: { jobId: string; data: unknown }) => {
    logger.debug(
      `Job ${jobId} progress in queue ${queueName}:`,
      typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>)
        : { progress: data },
    );
  });
});

// Health check function
export async function getQueueHealth(): Promise<{
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>;
}> {
  const queues = [
    { name: 'email', queue: emailQueue },
    { name: 'notifications', queue: notificationQueue },
    { name: 'maintenance-tasks', queue: maintenanceQueue },
    { name: 'reports', queue: reportQueue },
  ];

  const queueStats = await Promise.all(
    queues.map(async ({ name, queue }) => {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        name,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    }),
  );

  return { queues: queueStats };
}

// Queue management functions
export async function pauseAllQueues(): Promise<void> {
  await Promise.all([
    emailQueue.pause(),
    notificationQueue.pause(),
    maintenanceQueue.pause(),
    reportQueue.pause(),
  ]);
  logger.info('All queues paused');
}

export async function resumeAllQueues(): Promise<void> {
  await Promise.all([
    emailQueue.resume(),
    notificationQueue.resume(),
    maintenanceQueue.resume(),
    reportQueue.resume(),
  ]);
  logger.info('All queues resumed');
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  logger.info('Closing all queues...');

  await Promise.all([
    emailQueue.close(),
    notificationQueue.close(),
    maintenanceQueue.close(),
    reportQueue.close(),
    emailQueueEvents.close(),
    notificationQueueEvents.close(),
    maintenanceQueueEvents.close(),
    reportQueueEvents.close(),
  ]);

  await queueConnection.quit();
  logger.info('All queues closed');
}

// Export all queues for direct access if needed
export const queues = {
  email: emailQueue,
  notifications: notificationQueue,
  maintenance: maintenanceQueue,
  reports: reportQueue,
};
