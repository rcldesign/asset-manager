import type { PrismaClient } from '@prisma/client';
import { addNotificationJob } from '../lib/queue';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

export interface MentionContext {
  taskId?: string;
  commentId?: string;
  activityId?: string;
  messageType: 'task_comment' | 'activity_update' | 'collaboration_message';
  authorUserId: string;
  organizationId: string;
}

export interface MentionResult {
  mentionedUsers: Array<{
    id: string;
    email: string;
    fullName: string | null;
    organizationId: string;
    notificationPreferences: any;
  }>;
  notificationJobsCreated: number;
}

/**
 * Service for parsing @mentions and triggering notifications
 * Handles @username patterns in text content and creates notification jobs
 */
export class MentionsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Parse mentions from text content and create notification jobs
   * @param content - Text content to parse for @mentions
   * @param context - Context about where the mention occurred
   * @returns Result with mentioned users and notification count
   */
  async processMentions(content: string, context: MentionContext): Promise<MentionResult> {
    if (!content || !content.trim()) {
      return { mentionedUsers: [], notificationJobsCreated: 0 };
    }

    // Extract @username patterns from content
    const mentionedUsernames = this.extractMentions(content);

    if (mentionedUsernames.length === 0) {
      return { mentionedUsers: [], notificationJobsCreated: 0 };
    }

    logger.debug('Extracted mentions from content', {
      content: content.substring(0, 100),
      mentionedUsernames,
      context,
    });

    // Look up mentioned users in the organization
    const mentionedUsers = await this.findMentionedUsers(
      mentionedUsernames,
      context.organizationId,
    );

    // Filter out the author (don't notify yourself)
    const usersToNotify = mentionedUsers.filter((user) => user.id !== context.authorUserId);

    if (usersToNotify.length === 0) {
      logger.debug('No valid users to notify for mentions', {
        mentionedUsernames,
        authorUserId: context.authorUserId,
      });
      return { mentionedUsers, notificationJobsCreated: 0 };
    }

    // Create notification jobs for each mentioned user
    let jobsCreated = 0;
    for (const user of usersToNotify) {
      try {
        await this.createMentionNotification(user, context);
        jobsCreated++;
      } catch (error) {
        logger.error(
          'Failed to create mention notification',
          error instanceof Error ? error : new Error('Unknown error'),
          {
            targetUserId: user.id,
            contextType: context.messageType,
          },
        );
      }
    }

    logger.info('Successfully processed mentions', {
      mentionedCount: mentionedUsers.length,
      notifiedCount: jobsCreated,
      context,
    });

    return { mentionedUsers, notificationJobsCreated: jobsCreated };
  }

  /**
   * Extract @username patterns from text content
   * Supports formats: @username, @user.name, @user_name
   * @param content - Text to parse
   * @returns Array of unique usernames (without @ symbol)
   */
  private extractMentions(content: string): string[] {
    // Regex to match @username patterns
    // Allows letters, numbers, dots, underscores, and hyphens
    // Must start with letter, 3-30 characters total
    const mentionRegex = /@([a-zA-Z][a-zA-Z0-9._-]{2,29})/g;

    const mentions = new Set<string>();
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const username = match[1]!.toLowerCase(); // Normalize to lowercase
      mentions.add(username);
    }

    return Array.from(mentions);
  }

  /**
   * Find users by username within the organization
   * @param usernames - Array of usernames to look up
   * @param organizationId - Organization to search within
   * @returns Array of found users
   */
  private async findMentionedUsers(
    usernames: string[],
    organizationId: string,
  ): Promise<
    Array<{
      id: string;
      email: string;
      fullName: string | null;
      organizationId: string;
      notificationPreferences: any;
    }>
  > {
    if (usernames.length === 0) {
      return [];
    }

    try {
      const users = await this.prisma.user.findMany({
        where: {
          organizationId,
          OR: [
            // Match by email prefix (before @)
            {
              email: {
                in: usernames.map((username) => `${username}@%`),
                mode: 'insensitive',
              },
            },
            // Match by fullName
            {
              fullName: {
                in: usernames,
                mode: 'insensitive',
              },
            },
          ],
          // Only active users
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          organizationId: true,
          notificationPreferences: true,
        },
      });

      logger.debug('Found mentioned users', {
        requestedUsernames: usernames,
        foundUsers: users.map((u) => ({ id: u.id, email: u.email, fullName: u.fullName })),
      });

      return users;
    } catch (error) {
      logger.error(
        'Error finding mentioned users',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          usernames,
          organizationId,
        },
      );
      return [];
    }
  }

  /**
   * Create a notification job for a mention
   * @param user - User who was mentioned
   * @param context - Context about the mention
   */
  private async createMentionNotification(
    user: {
      id: string;
      email: string;
      fullName: string | null;
      organizationId: string;
      notificationPreferences: any;
    },
    context: MentionContext,
  ): Promise<void> {
    // Check user's notification preferences
    const prefs = user.notificationPreferences;
    if (prefs?.mentions === false) {
      logger.debug('User has disabled mention notifications', { userId: user.id });
      return;
    }

    // Determine notification title and message based on context
    const { title, message, actionUrl } = this.buildNotificationContent(context);

    // Create notification job
    await addNotificationJob({
      type: 'mention',
      userId: user.id,
      data: {
        title,
        message,
        context,
        actionUrl,
        mentionedBy: context.authorUserId,
      },
    });

    logger.debug('Created mention notification job', {
      userId: user.id,
      context,
      title,
    });
  }

  /**
   * Build notification content based on mention context
   * @param context - Mention context
   * @returns Notification title, message, and action URL
   */
  private buildNotificationContent(context: MentionContext): {
    title: string;
    message: string;
    actionUrl: string;
  } {
    switch (context.messageType) {
      case 'task_comment':
        return {
          title: 'You were mentioned in a task comment',
          message: 'Someone mentioned you in a task comment. Click to view the task.',
          actionUrl: `/tasks/${context.taskId}`,
        };

      case 'activity_update':
        return {
          title: 'You were mentioned in an activity update',
          message: 'Someone mentioned you in an activity update. Click to view the activity.',
          actionUrl: `/activities/${context.activityId}`,
        };

      case 'collaboration_message':
        return {
          title: 'You were mentioned in a collaboration message',
          message: 'Someone mentioned you in a message. Click to view the conversation.',
          actionUrl: `/tasks/${context.taskId || context.activityId}`,
        };

      default:
        return {
          title: 'You were mentioned',
          message: 'Someone mentioned you in a message.',
          actionUrl: '/',
        };
    }
  }

  /**
   * Validate mention context before processing
   * @param context - Context to validate
   * @throws ValidationError if context is invalid
   */
  validateContext(context: MentionContext): void {
    if (!context.authorUserId) {
      throw new ValidationError('Author user ID is required for mention processing');
    }

    if (!context.organizationId) {
      throw new ValidationError('Organization ID is required for mention processing');
    }

    if (!context.messageType) {
      throw new ValidationError('Message type is required for mention processing');
    }

    // Ensure at least one context ID is provided
    if (!context.taskId && !context.commentId && !context.activityId) {
      throw new ValidationError(
        'At least one context ID (taskId, commentId, activityId) is required',
      );
    }
  }

  /**
   * Get mention statistics for an organization
   * @param organizationId - Organization ID
   * @param days - Number of days to look back (default: 30)
   * @returns Mention statistics
   */
  async getMentionStats(
    organizationId: string,
    days: number = 30,
  ): Promise<{
    totalMentions: number;
    uniqueUsersMetioned: number;
    topMentionedUsers: Array<{ userId: string; email: string; mentionCount: number }>;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // This would require a mentions tracking table for full stats
    // For now, return placeholder data
    logger.info('Mention stats requested', { organizationId, days });

    return {
      totalMentions: 0,
      uniqueUsersMetioned: 0,
      topMentionedUsers: [],
    };
  }
}
