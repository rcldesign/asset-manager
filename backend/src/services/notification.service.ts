import {
  type PrismaClient,
  type Notification,
  type User,
  type Asset,
  type Task,
} from '@prisma/client';
import { addNotificationJob } from '../lib/queue';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  assetId?: string;
  taskId?: string;
  scheduleId?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  sendEmail?: boolean;
  sendInApp?: boolean;
}

export interface NotificationWithRelations extends Notification {
  user?: User;
  asset?: Asset | null;
  task?: Task | null;
}

export type NotificationType =
  | 'asset-warranty-expiring'
  | 'asset-maintenance-due'
  | 'task-assigned'
  | 'task-due'
  | 'task-overdue'
  | 'task-completed'
  | 'schedule-created'
  | 'schedule-updated'
  | 'welcome-user'
  | 'password-reset'
  | 'system-maintenance'
  | 'backup-completed'
  | 'backup-failed';

export interface NotificationTemplate {
  subject: string;
  message: string;
  emailSubject?: string;
  emailTemplate?: string;
}

export interface NotificationFilter {
  isRead?: boolean;
  type?: NotificationType | NotificationType[];
  assetId?: string;
  taskId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Service for managing notifications across multiple channels.
 * Handles in-app notifications, email delivery, and notification preferences.
 * Supports templating and bulk notifications.
 *
 * @class NotificationService
 */
export class NotificationService {
  /**
   * Creates an instance of NotificationService.
   * @param {PrismaClient} prisma - Prisma client instance
   */
  constructor(private prisma: PrismaClient) {}

  /**
   * Create and send a notification through multiple channels.
   * Supports in-app notifications and email delivery with templating.
   *
   * @param {CreateNotificationInput} input - Notification creation data
   * @returns {Promise<Notification>} The created notification
   * @throws {Error} If user not found or doesn't belong to organization
   *
   * @example
   * // Send task assignment notification
   * const notification = await notificationService.createNotification({
   *   organizationId: 'org-123',
   *   userId: 'user-456',
   *   taskId: 'task-789',
   *   type: 'task-assigned',
   *   title: 'New Task Assigned',
   *   message: 'You have been assigned to replace air filter',
   *   sendEmail: true,
   *   sendInApp: true
   * });
   */
  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    const {
      organizationId,
      userId,
      assetId,
      taskId,
      type,
      title,
      message,
      data,
      sendEmail = false,
      sendInApp = true,
    } = input;

    // Validate user exists and belongs to organization
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
      },
    });

    if (!user) {
      throw new Error('User not found or does not belong to organization');
    }

    // Create in-app notification if requested
    let notification: Notification | null = null;
    if (sendInApp) {
      notification = await this.prisma.notification.create({
        data: {
          organizationId,
          userId,
          assetId,
          taskId,
          type,
          title,
          message,
          data: data as any, // Prisma JsonValue compatibility
        },
      });

      logger.info('In-app notification created', {
        notificationId: notification.id,
        userId,
        type,
        title,
      });
    }

    // Send email notification if requested
    if (sendEmail && user.email) {
      try {
        // Determine notification type and send appropriate email
        if (type.startsWith('task-')) {
          // Get task details for email
          const task = taskId
            ? await this.prisma.task.findUnique({
                where: { id: taskId },
                include: { asset: true },
              })
            : null;

          await emailService.sendTaskNotificationEmail({
            to: user.email,
            userName: user.fullName || user.email,
            taskTitle: task?.title || title,
            taskDescription: task?.description || undefined,
            dueDate: task?.dueDate || new Date(),
            priority: task?.priority || 'MEDIUM',
            assetName: task?.asset?.name,
            taskId: taskId || '',
            notificationType: type.includes('assigned')
              ? 'assigned'
              : type.includes('overdue')
                ? 'overdue'
                : type.includes('completed')
                  ? 'completed'
                  : type.includes('due')
                    ? 'due-soon'
                    : 'updated',
          });
        } else {
          // For other notification types, queue generic email
          const template = this.getNotificationTemplate(type, data);
          const emailSubject = template.emailSubject || template.subject;
          const emailBody = template.emailTemplate || template.message;

          const formattedHtml = this.formatEmailContent(emailBody, user, data);

          await emailService.queueEmail({
            to: user.email,
            subject: emailSubject,
            html: formattedHtml,
            text: emailBody,
          });
        }

        logger.info('Email notification queued', {
          userId,
          email: user.email,
          type,
        });
      } catch (error) {
        logger.error(
          `Failed to queue email notification for user ${userId}, type: ${type}`,
          error instanceof Error ? error : new Error(String(error)),
        );
        // Don't throw - in-app notification should still be created
      }
    }

    // Queue for background processing (for push notifications, webhooks, etc.)
    if (notification) {
      try {
        await addNotificationJob({
          type: type as
            | 'asset-warranty-expiring'
            | 'task-due'
            | 'task-overdue'
            | 'welcome-user'
            | 'password-reset',
          userId,
          assetId,
          taskId,
          organizationId,
          data: {
            notificationId: notification.id,
            ...data,
          },
        });
      } catch (error) {
        logger.error(
          `Failed to queue notification job for notification ${notification.id}`,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    return notification || ({} as Notification); // Fallback for email-only notifications
  }

  /**
   * Get notifications for a user with filtering options.
   * Returns paginated results with related entities and unread count.
   *
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID for access control
   * @param {NotificationFilter} [filter={}] - Filter and pagination options
   * @returns {Promise<Object>} Notifications array with total and unread counts
   *
   * @example
   * // Get unread task notifications
   * const result = await notificationService.getUserNotifications(
   *   'user-123',
   *   'org-456',
   *   {
   *     isRead: false,
   *     type: ['task-assigned', 'task-due'],
   *     limit: 20
   *   }
   * );
   * console.log(`${result.unreadCount} unread notifications`);
   */
  async getUserNotifications(
    userId: string,
    organizationId: string,
    filter: NotificationFilter = {},
  ): Promise<{ notifications: NotificationWithRelations[]; total: number; unreadCount: number }> {
    const { isRead, type, assetId, taskId, dateFrom, dateTo, limit = 50, offset = 0 } = filter;

    const where = {
      userId,
      organizationId,
      ...(isRead !== undefined && { isRead }),
      ...(type && {
        type: Array.isArray(type) ? { in: type } : type,
      }),
      ...(assetId && { assetId }),
      ...(taskId && { taskId }),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: {
          asset: true,
          task: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          userId,
          organizationId,
          isRead: false,
        },
      }),
    ]);

    return { notifications, total, unreadCount };
  }

  /**
   * Mark a notification as read.
   * Updates read status and timestamp.
   *
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID for ownership verification
   * @param {string} organizationId - Organization ID for access control
   * @returns {Promise<void>}
   * @throws {Error} If notification not found
   *
   * @example
   * await notificationService.markAsRead('notification-123', 'user-456', 'org-789');
   */
  async markAsRead(notificationId: string, userId: string, organizationId: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
        organizationId,
      },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    logger.debug('Notification marked as read', {
      notificationId,
      userId,
    });
  }

  /**
   * Mark all notifications as read for a user.
   * Bulk update operation for notification cleanup.
   *
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @returns {Promise<number>} Number of notifications marked as read
   *
   * @example
   * const count = await notificationService.markAllAsRead('user-123', 'org-456');
   * console.log(`Marked ${count} notifications as read`);
   */
  async markAllAsRead(userId: string, organizationId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        organizationId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    logger.info('All notifications marked as read', {
      userId,
      count: result.count,
    });

    return result.count;
  }

  /**
   * Delete old notifications (cleanup job).
   * Removes read notifications older than specified days.
   *
   * @param {number} [olderThanDays=90] - Age threshold in days
   * @returns {Promise<number>} Number of notifications deleted
   *
   * @example
   * // Delete notifications older than 60 days
   * const deleted = await notificationService.deleteOldNotifications(60);
   * console.log(`Cleaned up ${deleted} old notifications`);
   */
  async deleteOldNotifications(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        isRead: true, // Only delete read notifications
      },
    });

    logger.info('Old notifications cleaned up', {
      olderThanDays,
      deletedCount: result.count,
    });

    return result.count;
  }

  /**
   * Get notification template for a specific type.
   * Provides localized templates with variable placeholders.
   *
   * @param {string} type - Notification type
   * @param {Record<string, unknown>} [_data] - Template data (unused but for future expansion)
   * @returns {NotificationTemplate} Template with subject and message formats
   * @private
   */
  private getNotificationTemplate(
    type: string,
    _data?: Record<string, unknown>,
  ): NotificationTemplate {
    const templates: Record<string, NotificationTemplate> = {
      'asset-warranty-expiring': {
        subject: 'Asset Warranty Expiring',
        message: 'The warranty for {{assetName}} expires on {{expiryDate}}',
        emailSubject: 'Asset Warranty Expiring - {{assetName}}',
        emailTemplate:
          'The warranty for asset "{{assetName}}" is expiring on {{expiryDate}}. Please take necessary action.',
      },
      'asset-maintenance-due': {
        subject: 'Asset Maintenance Due',
        message: 'Maintenance is due for {{assetName}}',
        emailSubject: 'Maintenance Due - {{assetName}}',
        emailTemplate:
          'Asset "{{assetName}}" is due for maintenance. Please schedule the required maintenance tasks.',
      },
      'task-assigned': {
        subject: 'Task Assigned',
        message: 'You have been assigned a new task: {{taskTitle}}',
        emailSubject: 'New Task Assignment - {{taskTitle}}',
        emailTemplate:
          'You have been assigned a new task: "{{taskTitle}}". Please review the task details and complete it by the due date.',
      },
      'task-due': {
        subject: 'Task Due',
        message: 'Task "{{taskTitle}}" is due {{dueDate}}',
        emailSubject: 'Task Due - {{taskTitle}}',
        emailTemplate:
          'Task "{{taskTitle}}" is due on {{dueDate}}. Please complete it as soon as possible.',
      },
      'task-overdue': {
        subject: 'Task Overdue',
        message: 'Task "{{taskTitle}}" is overdue',
        emailSubject: 'OVERDUE: Task - {{taskTitle}}',
        emailTemplate: 'Task "{{taskTitle}}" is now overdue. Please complete it immediately.',
      },
      'task-completed': {
        subject: 'Task Completed',
        message: 'Task "{{taskTitle}}" has been completed',
        emailSubject: 'Task Completed - {{taskTitle}}',
        emailTemplate: 'Task "{{taskTitle}}" has been successfully completed.',
      },
      'schedule-created': {
        subject: 'Schedule Created',
        message: 'A new maintenance schedule "{{scheduleName}}" has been created',
        emailSubject: 'New Schedule Created - {{scheduleName}}',
        emailTemplate:
          'A new maintenance schedule "{{scheduleName}}" has been created for your assets.',
      },
      'schedule-updated': {
        subject: 'Schedule Updated',
        message: 'Maintenance schedule "{{scheduleName}}" has been updated',
        emailSubject: 'Schedule Updated - {{scheduleName}}',
        emailTemplate:
          'Maintenance schedule "{{scheduleName}}" has been updated. Please review the changes.',
      },
      'welcome-user': {
        subject: 'Welcome to DumbAssets Enhanced',
        message: 'Welcome to DumbAssets Enhanced! Your account has been created successfully.',
        emailSubject: 'Welcome to DumbAssets Enhanced',
        emailTemplate:
          'Welcome to DumbAssets Enhanced! Your account has been created and you can now start managing your assets.',
      },
      'password-reset': {
        subject: 'Password Reset Requested',
        message: 'A password reset has been requested for your account',
        emailSubject: 'Password Reset - DumbAssets Enhanced',
        emailTemplate:
          'A password reset has been requested for your account. If you did not request this, please contact support.',
      },
      'system-maintenance': {
        subject: 'System Maintenance',
        message: 'System maintenance is scheduled for {{maintenanceDate}}',
        emailSubject: 'Scheduled System Maintenance',
        emailTemplate:
          'System maintenance is scheduled for {{maintenanceDate}}. Some features may be temporarily unavailable.',
      },
      'backup-completed': {
        subject: 'Backup Completed',
        message: 'System backup completed successfully',
        emailSubject: 'Backup Completed Successfully',
        emailTemplate: 'The scheduled system backup has completed successfully.',
      },
      'backup-failed': {
        subject: 'Backup Failed',
        message: 'System backup failed',
        emailSubject: 'ALERT: Backup Failed',
        emailTemplate:
          'The scheduled system backup has failed. Please check the system logs for details.',
      },
    };

    return (
      templates[type] || {
        subject: 'Notification',
        message: 'You have a new notification',
        emailSubject: 'Notification',
        emailTemplate: 'You have received a new notification.',
      }
    );
  }

  /**
   * Format email content with template variables.
   * Replaces placeholders with actual values from user and data.
   *
   * @param {string} template - Email template with {{variable}} placeholders
   * @param {User} user - User object for personalization
   * @param {Record<string, unknown>} [data] - Additional template data
   * @returns {string} Formatted email content
   * @private
   */
  private formatEmailContent(template: string, user: User, data?: Record<string, unknown>): string {
    let content = template;

    // Replace user variables
    content = content.replace(/{{userName}}/g, user.fullName || user.email);
    content = content.replace(/{{userEmail}}/g, user.email);

    // Replace data variables
    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, String(value));
      });
    }

    return content;
  }

  /**
   * Send bulk notifications (for system-wide announcements).
   * Processes notifications individually with error handling.
   *
   * @param {string} organizationId - Organization ID
   * @param {string[]} userIds - Array of user IDs to notify
   * @param {Omit<CreateNotificationInput, 'organizationId' | 'userId'>} notification - Notification data
   * @returns {Promise<Object>} Success and failure counts
   *
   * @example
   * // Send maintenance announcement to all users
   * const result = await notificationService.sendBulkNotifications(
   *   'org-123',
   *   ['user-1', 'user-2', 'user-3'],
   *   {
   *     type: 'system-maintenance',
   *     title: 'Scheduled Maintenance',
   *     message: 'System will be offline for maintenance on Sunday',
   *     sendEmail: true,
   *     sendInApp: true
   *   }
   * );
   * console.log(`Sent to ${result.success} users, ${result.failed} failed`);
   */
  async sendBulkNotifications(
    organizationId: string,
    userIds: string[],
    notification: Omit<CreateNotificationInput, 'organizationId' | 'userId'>,
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        await this.createNotification({
          ...notification,
          organizationId,
          userId,
        });
        success++;
      } catch (error) {
        logger.error(
          `Failed to send bulk notification to user ${userId}, org: ${organizationId}, type: ${notification.type}`,
          error instanceof Error ? error : new Error(String(error)),
        );
        failed++;
      }
    }

    logger.info('Bulk notifications sent', {
      organizationId,
      total: userIds.length,
      success,
      failed,
    });

    return { success, failed };
  }

  /**
   * Get notification statistics for an organization.
   * Provides aggregated data for reporting and analytics.
   *
   * @param {string} organizationId - Organization ID
   * @param {Date} [dateFrom] - Start date for filtering
   * @param {Date} [dateTo] - End date for filtering
   * @returns {Promise<Object>} Statistics including totals and breakdown by type
   *
   * @example
   * // Get notification stats for last 30 days
   * const thirtyDaysAgo = new Date();
   * thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
   *
   * const stats = await notificationService.getNotificationStats(
   *   'org-123',
   *   thirtyDaysAgo,
   *   new Date()
   * );
   *
   * console.log(`Total: ${stats.total}, Unread: ${stats.unread}`);
   * console.log('By type:', stats.byType);
   */
  async getNotificationStats(
    organizationId: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<{
    total: number;
    read: number;
    unread: number;
    byType: Record<string, number>;
  }> {
    const where = {
      organizationId,
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {}),
    };

    const [total, read, notifications] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, isRead: true } }),
      this.prisma.notification.findMany({
        where,
        select: { type: true },
      }),
    ]);

    const unread = total - read;
    const byType: Record<string, number> = {};

    notifications.forEach((notification) => {
      byType[notification.type] = (byType[notification.type] || 0) + 1;
    });

    return {
      total,
      read,
      unread,
      byType,
    };
  }
}
