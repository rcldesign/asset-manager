import type { Job } from 'bullmq';
import { logger } from '../utils/logger';
import { addEmailJob } from '../lib/queue';
import type { NotificationJob } from '../lib/queue';

// Specific interfaces for notification data
interface TaskNotificationData {
  userName: string;
  taskTitle: string;
  dueDate: string;
  userEmail: string;
}

// Additional interfaces can be added here as needed for other notification types

// Type guards for runtime validation
function isTaskNotificationData(data: unknown): data is TaskNotificationData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const d = data as Record<string, unknown>;
  return (
    typeof d.userName === 'string' &&
    typeof d.taskTitle === 'string' &&
    typeof d.dueDate === 'string' &&
    typeof d.userEmail === 'string'
  );
}

// Additional type guards can be added here as needed

export async function processNotificationJob(
  job: Job<NotificationJob>,
): Promise<{ status: string; actions: string[] }> {
  const { data } = job;
  const actions: string[] = [];

  try {
    await job.updateProgress(10);

    logger.info(`Processing notification job`, {
      jobId: job.id,
      type: data.type,
      userId: data.userId,
    });

    await job.updateProgress(30);

    switch (data.type) {
      case 'welcome-user':
        await handleWelcomeUser(data, actions);
        break;

      case 'password-reset':
        await handlePasswordReset(data, actions);
        break;

      case 'asset-warranty-expiring':
        await handleWarrantyExpiring(data, actions);
        break;

      case 'task-due':
        await handleTaskDue(data, actions);
        break;

      case 'task-overdue':
        await handleTaskOverdue(data, actions);
        break;

      default:
        throw new Error(`Unknown notification type: ${String(data.type)}`);
    }

    await job.updateProgress(100);

    logger.info(`Notification processed successfully`, {
      jobId: job.id,
      type: data.type,
      actions: actions.length,
    });

    return {
      status: 'processed',
      actions,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to process notification job', error, {
      jobId: job.id,
      type: data.type,
      userId: data.userId,
    });
    throw error;
  }
}

async function handleWelcomeUser(data: NotificationJob, actions: string[]): Promise<void> {
  if (!data.userId || !data.data?.email || !data.data?.name) {
    throw new Error('Missing required data for welcome user notification');
  }

  // Send welcome email
  await addEmailJob({
    to: data.data.email as string,
    subject: 'Welcome to DumbAssets Enhanced!',
    template: 'welcome',
    templateData: {
      name: data.data.name,
    },
  });

  actions.push('welcome-email-queued');
}

async function handlePasswordReset(data: NotificationJob, actions: string[]): Promise<void> {
  if (!data.data?.email || !data.data?.name || !data.data?.resetLink) {
    throw new Error('Missing required data for password reset notification');
  }

  // Send password reset email
  await addEmailJob({
    to: data.data.email as string,
    subject: 'Password Reset Request - DumbAssets Enhanced',
    template: 'password-reset',
    templateData: {
      name: data.data.name,
      resetLink: data.data.resetLink,
    },
  });

  actions.push('password-reset-email-queued');
}

async function handleWarrantyExpiring(data: NotificationJob, actions: string[]): Promise<void> {
  if (
    !data.assetId ||
    !data.data?.userEmail ||
    !data.data?.userName ||
    !data.data?.assetName ||
    !data.data?.expiryDate
  ) {
    throw new Error('Missing required data for warranty expiring notification');
  }

  // Send warranty expiring email
  await addEmailJob({
    to: data.data.userEmail as string,
    subject: 'Warranty Expiring Soon - DumbAssets Enhanced',
    template: 'warranty-expiring',
    templateData: {
      name: data.data.userName,
      assetName: data.data.assetName,
      expiryDate: data.data.expiryDate,
    },
  });

  actions.push('warranty-expiring-email-queued');

  // TODO: Could also trigger in-app notifications, mobile push notifications, etc.
}

async function handleTaskDue(data: NotificationJob, actions: string[]): Promise<void> {
  if (!data.taskId) {
    throw new Error('Missing taskId for task due notification');
  }

  if (!isTaskNotificationData(data.data)) {
    throw new Error('Invalid task notification data format');
  }

  const taskData: TaskNotificationData = data.data;

  // Send task due email
  await addEmailJob({
    to: taskData.userEmail,
    subject: 'Task Due Soon - DumbAssets Enhanced',
    html: `
      <h2>Task Due Soon</h2>
      <p>Hello ${taskData.userName},</p>
      <p>Your task "${taskData.taskTitle}" is due on ${taskData.dueDate}.</p>
      <p>Please review and complete it as soon as possible.</p>
      <p>Best regards,<br>DumbAssets Enhanced Team</p>
    `,
    text: `Task Due Soon\n\nHello ${taskData.userName},\n\nYour task "${taskData.taskTitle}" is due on ${taskData.dueDate}.\n\nPlease review and complete it as soon as possible.\n\nBest regards,\nDumbAssets Enhanced Team`,
  });

  actions.push('task-due-email-queued');
}

async function handleTaskOverdue(data: NotificationJob, actions: string[]): Promise<void> {
  if (!data.taskId) {
    throw new Error('Missing taskId for task overdue notification');
  }

  if (!isTaskNotificationData(data.data)) {
    throw new Error('Invalid task notification data format');
  }

  const taskData: TaskNotificationData = data.data;

  // Send task overdue email (higher priority)
  await addEmailJob(
    {
      to: taskData.userEmail,
      subject: 'URGENT: Task Overdue - DumbAssets Enhanced',
      html: `
      <h2 style="color: #d32f2f;">Task Overdue</h2>
      <p>Hello ${taskData.userName},</p>
      <p><strong>Your task "${taskData.taskTitle}" was due on ${taskData.dueDate} and is now overdue.</strong></p>
      <p>Please complete this task immediately to avoid any issues.</p>
      <p>Best regards,<br>DumbAssets Enhanced Team</p>
    `,
      text: `URGENT: Task Overdue\n\nHello ${taskData.userName},\n\nYour task "${taskData.taskTitle}" was due on ${taskData.dueDate} and is now overdue.\n\nPlease complete this task immediately to avoid any issues.\n\nBest regards,\nDumbAssets Enhanced Team`,
    },
    { priority: 10 },
  ); // High priority

  actions.push('task-overdue-email-queued');
}
