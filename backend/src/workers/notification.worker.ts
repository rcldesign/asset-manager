import type { Job } from 'bullmq';
import { logger } from '../utils/logger';
import { addEmailJob } from '../lib/queue';
import type { NotificationJob } from '../lib/queue';

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
        throw new Error(`Unknown notification type: ${data.type}`);
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
  } catch (err) {
    logger.error('Failed to process notification job', {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
      type: data.type,
      userId: data.userId,
    });
    throw err;
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
  if (
    !data.taskId ||
    !data.data?.userEmail ||
    !data.data?.userName ||
    !data.data?.taskTitle ||
    !data.data?.dueDate
  ) {
    throw new Error('Missing required data for task due notification');
  }

  // Send task due email
  await addEmailJob({
    to: data.data.userEmail as string,
    subject: 'Task Due Soon - DumbAssets Enhanced',
    html: `
      <h2>Task Due Soon</h2>
      <p>Hello ${data.data.userName},</p>
      <p>Your task "${data.data.taskTitle}" is due on ${data.data.dueDate}.</p>
      <p>Please review and complete it as soon as possible.</p>
      <p>Best regards,<br>DumbAssets Enhanced Team</p>
    `,
    text: `Task Due Soon\n\nHello ${data.data.userName},\n\nYour task "${data.data.taskTitle}" is due on ${data.data.dueDate}.\n\nPlease review and complete it as soon as possible.\n\nBest regards,\nDumbAssets Enhanced Team`,
  });

  actions.push('task-due-email-queued');
}

async function handleTaskOverdue(data: NotificationJob, actions: string[]): Promise<void> {
  if (
    !data.taskId ||
    !data.data?.userEmail ||
    !data.data?.userName ||
    !data.data?.taskTitle ||
    !data.data?.dueDate
  ) {
    throw new Error('Missing required data for task overdue notification');
  }

  // Send task overdue email (higher priority)
  await addEmailJob(
    {
      to: data.data.userEmail as string,
      subject: 'URGENT: Task Overdue - DumbAssets Enhanced',
      html: `
      <h2 style="color: #d32f2f;">Task Overdue</h2>
      <p>Hello ${data.data.userName},</p>
      <p><strong>Your task "${data.data.taskTitle}" was due on ${data.data.dueDate} and is now overdue.</strong></p>
      <p>Please complete this task immediately to avoid any issues.</p>
      <p>Best regards,<br>DumbAssets Enhanced Team</p>
    `,
      text: `URGENT: Task Overdue\n\nHello ${data.data.userName},\n\nYour task "${data.data.taskTitle}" was due on ${data.data.dueDate} and is now overdue.\n\nPlease complete this task immediately to avoid any issues.\n\nBest regards,\nDumbAssets Enhanced Team`,
    },
    { priority: 10 },
  ); // High priority

  actions.push('task-overdue-email-queued');
}
