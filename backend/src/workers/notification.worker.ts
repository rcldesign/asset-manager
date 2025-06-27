import type { Job } from 'bullmq';
import { logger } from '../utils/logger';
import { addEmailJob, addPushNotificationJob } from '../lib/queue';
import type { NotificationJob } from '../lib/queue';
import { appriseService } from '../services/apprise.service';

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

// Helper function to send Apprise notification
async function sendAppriseNotification(
  type: string,
  title: string,
  body: string,
  tags?: string[],
): Promise<void> {
  if (!appriseService.isConfigured()) {
    return;
  }

  try {
    await appriseService.sendNotification({
      title,
      body,
      type:
        type === 'error' || type === 'alert'
          ? 'error'
          : type === 'warning'
            ? 'warning'
            : type === 'success'
              ? 'success'
              : 'info',
      tag: tags,
      format: 'markdown',
    });
  } catch (error) {
    logger.error(
      'Failed to send Apprise notification',
      error instanceof Error ? error : new Error('Unknown error'),
      {
        notificationType: type,
        title,
      },
    );
    // Don't throw - Apprise is optional
  }
}

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

      case 'invitation':
        await handleInvitation(data, actions);
        break;

      case 'task-assigned':
        await handleTaskAssigned(data, actions);
        break;

      case 'mention':
        await handleMention(data, actions);
        break;

      case 'schedule-changed':
        await handleScheduleChanged(data, actions);
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

  // Send Apprise notification
  await sendAppriseNotification(
    'info',
    'New User Welcome',
    `Welcome ${data.data.name} to DumbAssets Enhanced!`,
    ['users', 'admin'],
  );
  actions.push('apprise-notification-sent');
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

  // Send Apprise notification
  await sendAppriseNotification(
    'warning',
    'Password Reset Request',
    `Password reset requested for ${data.data.name} (${data.data.email})`,
    ['security', 'admin'],
  );
  actions.push('apprise-notification-sent');
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

  // Send push notification
  if (data.userId) {
    await addPushNotificationJob({
      userId: data.userId,
      payload: {
        title: 'Warranty Expiring Soon',
        body: `The warranty for ${data.data.assetName} is expiring on ${data.data.expiryDate}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: {
          url: `/assets/${data.assetId}`,
        },
      },
    });
    actions.push('push-notification-queued');
  }

  // Send Apprise notification
  await sendAppriseNotification(
    'warning',
    'Warranty Expiring Soon',
    `The warranty for **${data.data.assetName}** is expiring on ${data.data.expiryDate}`,
    ['assets', 'maintenance'],
  );
  actions.push('apprise-notification-sent');
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

  // Send push notification
  if (data.userId) {
    await addPushNotificationJob({
      userId: data.userId,
      payload: {
        title: 'Task Due Soon',
        body: `${taskData.taskTitle} is due on ${taskData.dueDate}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: {
          url: `/tasks/${data.taskId}`,
        },
      },
    });
    actions.push('push-notification-queued');
  }

  // Send Apprise notification
  await sendAppriseNotification(
    'warning',
    'Task Due Soon',
    `Task **${taskData.taskTitle}** is due on ${taskData.dueDate}`,
    ['tasks', 'users'],
  );
  actions.push('apprise-notification-sent');
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

  // Send push notification with high priority
  if (data.userId) {
    await addPushNotificationJob(
      {
        userId: data.userId,
        payload: {
          title: '⚠️ Task Overdue',
          body: `${taskData.taskTitle} was due on ${taskData.dueDate}`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          data: {
            url: `/tasks/${data.taskId}`,
          },
        },
      },
      { priority: 1 },
    );
    actions.push('push-notification-queued');
  }

  // Send Apprise notification
  await sendAppriseNotification(
    'error',
    '⚠️ Task Overdue',
    `Task **${taskData.taskTitle}** was due on ${taskData.dueDate} and is now overdue!`,
    ['tasks', 'alerts', 'admin'],
  );
  actions.push('apprise-notification-sent');
}

async function handleInvitation(data: NotificationJob, actions: string[]): Promise<void> {
  if (
    !data.data?.email ||
    !data.data?.invitedByName ||
    !data.data?.organizationName ||
    !data.data?.invitationToken
  ) {
    throw new Error('Missing required data for invitation notification');
  }

  const invitationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${data.data.invitationToken}`;
  const isResend = data.data.isResend as boolean;

  await addEmailJob({
    to: data.data.email as string,
    subject: `${isResend ? '[Reminder] ' : ''}You're invited to join ${data.data.organizationName} - DumbAssets Enhanced`,
    html: `
      <h2>You're Invited!</h2>
      <p>Hello,</p>
      <p>${data.data.invitedByName} has invited you to join <strong>${data.data.organizationName}</strong> on DumbAssets Enhanced.</p>
      <p><strong>Role:</strong> ${data.data.role}</p>
      <p><a href="${invitationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Invitation</a></p>
      <p>Or copy and paste this link: ${invitationUrl}</p>
      <p>This invitation expires on ${new Date(data.data.expiresAt as string).toLocaleDateString()}.</p>
      <p>Best regards,<br>DumbAssets Enhanced Team</p>
    `,
    text: `You're Invited!\n\nHello,\n\n${data.data.invitedByName} has invited you to join ${data.data.organizationName} on DumbAssets Enhanced.\n\nRole: ${data.data.role}\n\nAccept invitation: ${invitationUrl}\n\nThis invitation expires on ${new Date(data.data.expiresAt as string).toLocaleDateString()}.\n\nBest regards,\nDumbAssets Enhanced Team`,
  });

  actions.push('invitation-email-queued');

  // Send Apprise notification
  await sendAppriseNotification(
    'info',
    'New Invitation',
    `${data.data.invitedByName} invited ${data.data.email} to join **${data.data.organizationName}** as ${data.data.role}`,
    ['invitations', 'admin'],
  );
  actions.push('apprise-notification-sent');
}

async function handleTaskAssigned(data: NotificationJob, actions: string[]): Promise<void> {
  if (!data.taskId || !data.data?.userEmail || !data.data?.userName || !data.data?.taskTitle) {
    throw new Error('Missing required data for task assigned notification');
  }

  const taskUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tasks/${data.taskId}`;

  await addEmailJob({
    to: data.data.userEmail as string,
    subject: 'New Task Assigned - DumbAssets Enhanced',
    html: `
      <h2>New Task Assigned</h2>
      <p>Hello ${data.data.userName},</p>
      <p>You have been assigned a new task: <strong>${data.data.taskTitle}</strong></p>
      ${data.data.dueDate ? `<p><strong>Due Date:</strong> ${data.data.dueDate}</p>` : ''}
      ${data.data.description ? `<p><strong>Description:</strong> ${data.data.description}</p>` : ''}
      <p><a href="${taskUrl}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Task</a></p>
      <p>Best regards,<br>DumbAssets Enhanced Team</p>
    `,
    text: `New Task Assigned\n\nHello ${data.data.userName},\n\nYou have been assigned a new task: ${data.data.taskTitle}\n\n${data.data.dueDate ? `Due Date: ${data.data.dueDate}\n` : ''}${data.data.description ? `Description: ${data.data.description}\n` : ''}\nView task: ${taskUrl}\n\nBest regards,\nDumbAssets Enhanced Team`,
  });

  actions.push('task-assigned-email-queued');

  // Send push notification
  if (data.userId) {
    await addPushNotificationJob({
      userId: data.userId,
      payload: {
        title: 'New Task Assigned',
        body: `You have been assigned: ${data.data.taskTitle}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: {
          url: `/tasks/${data.taskId}`,
        },
      },
    });
    actions.push('push-notification-queued');
  }

  // Send Apprise notification
  await sendAppriseNotification(
    'info',
    'Task Assigned',
    `${data.data.userName} has been assigned task: **${data.data.taskTitle}**${data.data.dueDate ? ` (Due: ${data.data.dueDate})` : ''}`,
    ['tasks', 'assignments'],
  );
  actions.push('apprise-notification-sent');
}

async function handleMention(data: NotificationJob, actions: string[]): Promise<void> {
  if (
    !data.data?.userEmail ||
    !data.data?.userName ||
    !data.data?.mentionedBy ||
    !data.data?.commentText
  ) {
    throw new Error('Missing required data for mention notification');
  }

  const commentUrl =
    (data.data.commentUrl as string) ||
    `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tasks/${data.taskId}`;

  await addEmailJob({
    to: data.data.userEmail as string,
    subject: 'You were mentioned in a comment - DumbAssets Enhanced',
    html: `
      <h2>You were mentioned</h2>
      <p>Hello ${data.data.userName},</p>
      <p><strong>${data.data.mentionedBy}</strong> mentioned you in a comment:</p>
      <blockquote style="border-left: 4px solid #007bff; padding-left: 16px; margin: 16px 0; color: #666;">
        ${data.data.commentText}
      </blockquote>
      <p><a href="${commentUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Comment</a></p>
      <p>Best regards,<br>DumbAssets Enhanced Team</p>
    `,
    text: `You were mentioned\n\nHello ${data.data.userName},\n\n${data.data.mentionedBy} mentioned you in a comment:\n\n"${data.data.commentText}"\n\nView comment: ${commentUrl}\n\nBest regards,\nDumbAssets Enhanced Team`,
  });

  actions.push('mention-email-queued');

  // Send push notification
  if (data.userId) {
    await addPushNotificationJob(
      {
        userId: data.userId,
        payload: {
          title: 'You were mentioned',
          body: `${data.data.mentionedBy} mentioned you in a comment`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          data: {
            url: commentUrl,
          },
        },
      },
      { priority: 2 },
    );
    actions.push('push-notification-queued');
  }

  // Send Apprise notification
  await sendAppriseNotification(
    'info',
    'You were mentioned',
    `**${data.data.mentionedBy}** mentioned you in a comment:\n> ${data.data.commentText}`,
    ['mentions', 'collaboration'],
  );
  actions.push('apprise-notification-sent');
}

async function handleScheduleChanged(data: NotificationJob, actions: string[]): Promise<void> {
  if (
    !data.data?.userEmail ||
    !data.data?.userName ||
    !data.data?.scheduleName ||
    !data.data?.changeDescription
  ) {
    throw new Error('Missing required data for schedule changed notification');
  }

  const scheduleUrl =
    (data.data.scheduleUrl as string) ||
    `${process.env.FRONTEND_URL || 'http://localhost:3000'}/schedules/${data.data.scheduleId}`;

  await addEmailJob({
    to: data.data.userEmail as string,
    subject: 'Schedule Updated - DumbAssets Enhanced',
    html: `
      <h2>Schedule Updated</h2>
      <p>Hello ${data.data.userName},</p>
      <p>A schedule that affects your tasks has been updated:</p>
      <p><strong>Schedule:</strong> ${data.data.scheduleName}</p>
      <p><strong>Changes:</strong> ${data.data.changeDescription}</p>
      ${data.data.affectedTasks ? `<p><strong>Affected Tasks:</strong> ${data.data.affectedTasks}</p>` : ''}
      <p><a href="${scheduleUrl}" style="background-color: #ffc107; color: black; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Schedule</a></p>
      <p>Best regards,<br>DumbAssets Enhanced Team</p>
    `,
    text: `Schedule Updated\n\nHello ${data.data.userName},\n\nA schedule that affects your tasks has been updated:\n\nSchedule: ${data.data.scheduleName}\nChanges: ${data.data.changeDescription}\n${data.data.affectedTasks ? `Affected Tasks: ${data.data.affectedTasks}\n` : ''}\nView schedule: ${scheduleUrl}\n\nBest regards,\nDumbAssets Enhanced Team`,
  });

  actions.push('schedule-changed-email-queued');

  // Send Apprise notification
  await sendAppriseNotification(
    'info',
    'Schedule Updated',
    `Schedule **${data.data.scheduleName}** has been updated: ${data.data.changeDescription}`,
    ['schedules', 'updates'],
  );
  actions.push('apprise-notification-sent');
}
