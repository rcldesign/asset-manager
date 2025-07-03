import { Queue, QueueEvents, type Job } from 'bullmq';
import { createRedisConnection } from './redis';
import { logger } from '../utils/logger';
import type { ActivityEventPayload } from '../types/activity';

// Skip queue initialization in test environment
const isTestEnvironment = process.env.NODE_ENV === 'test';

// Create shared Redis connection for queues (skip in tests)
const queueConnection = isTestEnvironment ? null : createRedisConnection();

// Mock queue for tests
const createMockQueue = (_name: string): any => ({
  add: () => Promise.resolve({ id: '1', data: {} }),
  close: () => Promise.resolve(),
  pause: () => Promise.resolve(),
  resume: () => Promise.resolve(),
  getWaiting: () => Promise.resolve([]),
  getActive: () => Promise.resolve([]),
  getCompleted: () => Promise.resolve([]),
  getFailed: () => Promise.resolve([]),
  getDelayed: () => Promise.resolve([]),
});

// Queue definitions with BullMQ
export const emailQueue = isTestEnvironment 
  ? createMockQueue('email')
  : new Queue('email', {
  connection: queueConnection!,
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

export const notificationQueue = isTestEnvironment
  ? createMockQueue('notifications')
  : new Queue('notifications', {
  connection: queueConnection!,
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

export const maintenanceQueue = isTestEnvironment
  ? createMockQueue('maintenance-tasks')
  : new Queue('maintenance-tasks', {
  connection: queueConnection!,
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

export const reportQueue = isTestEnvironment
  ? createMockQueue('reports')
  : new Queue('reports', {
  connection: queueConnection!,
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

export const scheduleQueue = isTestEnvironment
  ? createMockQueue('schedules')
  : new Queue('schedules', {
  connection: queueConnection!,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 25,
    attempts: 1, // Schedule jobs should not retry - if they fail, log and continue
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const activityQueue = isTestEnvironment
  ? createMockQueue('activities')
  : new Queue('activities', {
  connection: queueConnection!,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const pushNotificationQueue = isTestEnvironment
  ? createMockQueue('push-notifications')
  : new Queue('push-notifications', {
  connection: queueConnection!,
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

export const webhookQueue = isTestEnvironment
  ? createMockQueue('webhooks')
  : new Queue('webhooks', {
  connection: queueConnection!,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const syncQueue = isTestEnvironment
  ? createMockQueue('sync')
  : new Queue('sync', {
  connection: queueConnection!,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 100,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Mock queue events for tests
const createMockQueueEvents = (_name: string): any => ({
  on: () => {},
  close: () => Promise.resolve(),
});

// Queue Events for monitoring
export const emailQueueEvents = isTestEnvironment
  ? createMockQueueEvents('email')
  : new QueueEvents('email', {
  connection: createRedisConnection(),
});
export const notificationQueueEvents = isTestEnvironment
  ? createMockQueueEvents('notifications')
  : new QueueEvents('notifications', {
  connection: createRedisConnection(),
});
export const maintenanceQueueEvents = isTestEnvironment
  ? createMockQueueEvents('maintenance-tasks')
  : new QueueEvents('maintenance-tasks', {
  connection: createRedisConnection(),
});
export const reportQueueEvents = isTestEnvironment
  ? createMockQueueEvents('reports')
  : new QueueEvents('reports', {
  connection: createRedisConnection(),
});
export const scheduleQueueEvents = isTestEnvironment
  ? createMockQueueEvents('schedules')
  : new QueueEvents('schedules', {
  connection: createRedisConnection(),
});
export const activityQueueEvents = isTestEnvironment
  ? createMockQueueEvents('activities')
  : new QueueEvents('activities', {
  connection: createRedisConnection(),
});

const pushNotificationQueueEvents = isTestEnvironment
  ? createMockQueueEvents('push-notifications')
  : new QueueEvents('push-notifications', {
  connection: createRedisConnection(),
});

export const webhookQueueEvents = isTestEnvironment
  ? createMockQueueEvents('webhooks')
  : new QueueEvents('webhooks', {
  connection: createRedisConnection(),
});

export const syncQueueEvents = isTestEnvironment
  ? createMockQueueEvents('sync')
  : new QueueEvents('sync', {
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
  type:
    | 'asset-warranty-expiring'
    | 'task-due'
    | 'task-overdue'
    | 'welcome-user'
    | 'password-reset'
    | 'invitation'
    | 'task-assigned'
    | 'mention'
    | 'schedule-changed';
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

export interface ScheduleJob {
  type: 'process-schedule' | 'generate-tasks';
  scheduleId: string;
  organizationId: string;
  assetId?: string;
  occurrenceDate: string; // ISO string
  data?: Record<string, unknown>;
}

export type ActivityJob = ActivityEventPayload;

export interface PushNotificationJob {
  userId: string;
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    data?: Record<string, any>;
    actions?: Array<{
      action: string;
      title: string;
      icon?: string;
    }>;
  };
}

export interface WebhookJob {
  webhookId: string;
  event: {
    id: string;
    type: string;
    organizationId: string;
    timestamp: Date;
    data: Record<string, any>;
    userId?: string;
    metadata?: Record<string, any>;
  };
}

export interface SyncJob {
  type: 'batch-sync' | 'critical-sync' | 'type-sync' | 'custom-sync' | 'retry-sync';
  clientId: string;
  itemIds?: string[];
  entityType?: string;
  tag?: string;
  priority?: number;
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

export async function addScheduleJob(
  data: ScheduleJob,
  options?: { delay?: number; priority?: number },
): Promise<Job> {
  return scheduleQueue.add('process-schedule', data, {
    delay: options?.delay,
    priority: options?.priority,
  });
}

export async function addActivityJob(
  data: ActivityJob,
  options?: { delay?: number; priority?: number },
): Promise<Job> {
  return activityQueue.add('process-activity', data, {
    delay: options?.delay,
    priority: options?.priority,
  });
}

export async function addPushNotificationJob(
  data: PushNotificationJob,
  options?: { delay?: number; priority?: number },
): Promise<Job> {
  return pushNotificationQueue.add('send-push-notification', data, {
    delay: options?.delay,
    priority: options?.priority,
  });
}

export async function addWebhookJob(
  data: WebhookJob,
  options?: { delay?: number; priority?: number },
): Promise<Job> {
  return webhookQueue.add('deliver-webhook', data, {
    delay: options?.delay,
    priority: options?.priority,
  });
}

export async function addSyncJob(
  data: SyncJob,
  options?: { delay?: number; priority?: number },
): Promise<Job> {
  return syncQueue.add('process-sync', data, {
    delay: options?.delay,
    priority: options?.priority || data.priority,
  });
}

// Queue event handlers for logging
const allQueueEvents = [
  emailQueueEvents,
  notificationQueueEvents,
  maintenanceQueueEvents,
  reportQueueEvents,
  scheduleQueueEvents,
  activityQueueEvents,
  pushNotificationQueueEvents,
  webhookQueueEvents,
  syncQueueEvents,
];

if (!isTestEnvironment) {
  allQueueEvents.forEach((queueEvents, index) => {
  const queueNames = [
    'email',
    'notifications',
    'maintenance-tasks',
    'reports',
    'schedules',
    'activities',
    'push-notifications',
    'webhooks',
    'sync',
  ];
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
}

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
    { name: 'schedules', queue: scheduleQueue },
    { name: 'activities', queue: activityQueue },
    { name: 'push-notifications', queue: pushNotificationQueue },
    { name: 'webhooks', queue: webhookQueue },
    { name: 'sync', queue: syncQueue },
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
    scheduleQueue.pause(),
    activityQueue.pause(),
    pushNotificationQueue.pause(),
    webhookQueue.pause(),
    syncQueue.pause(),
  ]);
  logger.info('All queues paused');
}

export async function resumeAllQueues(): Promise<void> {
  await Promise.all([
    emailQueue.resume(),
    notificationQueue.resume(),
    maintenanceQueue.resume(),
    reportQueue.resume(),
    scheduleQueue.resume(),
    activityQueue.resume(),
    pushNotificationQueue.resume(),
    webhookQueue.resume(),
    syncQueue.resume(),
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
    scheduleQueue.close(),
    activityQueue.close(),
    pushNotificationQueue.close(),
    webhookQueue.close(),
    syncQueue.close(),
    emailQueueEvents.close(),
    notificationQueueEvents.close(),
    maintenanceQueueEvents.close(),
    reportQueueEvents.close(),
    scheduleQueueEvents.close(),
    activityQueueEvents.close(),
    pushNotificationQueueEvents.close(),
    webhookQueueEvents.close(),
    syncQueueEvents.close(),
  ]);

  if (queueConnection) {
    await queueConnection.quit();
  }
  logger.info('All queues closed');
}

// Export all queues for direct access if needed
export const queues = {
  email: emailQueue,
  notifications: notificationQueue,
  maintenance: maintenanceQueue,
  reports: reportQueue,
  schedules: scheduleQueue,
  activities: activityQueue,
  pushNotifications: pushNotificationQueue,
  webhooks: webhookQueue,
};
