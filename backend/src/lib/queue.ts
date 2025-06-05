import Bull from 'bull';
import { config } from '../config';
import { logger } from '../utils/logger';

// Queue definitions
export const taskQueue = new Bull('task-generation', config.redis.url, {
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const notificationQueue = new Bull('notifications', config.redis.url, {
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const calendarQueue = new Bull('calendar-sync', config.redis.url, {
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

// Queue event handlers
[taskQueue, notificationQueue, calendarQueue].forEach((queue) => {
  queue.on('completed', (job) => {
    logger.debug(`Job ${job.id} completed in queue ${queue.name}`);
  });

  queue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed in queue ${queue.name}`, err);
  });

  queue.on('stalled', (job) => {
    logger.warn(`Job ${job.id} stalled in queue ${queue.name}`);
  });
});

// Job type definitions
export interface GenerateTasksJob {
  type: 'generate-all-tasks' | 'generate-schedule-tasks';
  scheduleId?: string;
  forwardMonths: number;
}

export interface NotificationJob {
  type: 'daily-digest' | 'task-reminder' | 'welcome-email';
  userId?: string;
  taskId?: string;
  data?: Record<string, unknown>;
}

export interface CalendarSyncJob {
  type: 'sync-task-to-calendar' | 'process-calendar-webhook';
  taskId?: string;
  userId?: string;
  webhookPayload?: unknown;
}

// Queue helper functions
export async function addTaskGenerationJob(data: GenerateTasksJob): Promise<Bull.Job> {
  return taskQueue.add('generate-tasks', data);
}

export async function addNotificationJob(data: NotificationJob): Promise<Bull.Job> {
  return notificationQueue.add('send-notification', data);
}

export async function addCalendarSyncJob(data: CalendarSyncJob): Promise<Bull.Job> {
  return calendarQueue.add('calendar-sync', data);
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  await Promise.all([taskQueue.close(), notificationQueue.close(), calendarQueue.close()]);
}
