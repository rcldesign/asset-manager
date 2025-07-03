import { prisma } from '../lib/prisma';
import { GoogleCalendarService } from './google-calendar.service';
import { TaskService } from './task.service';
import { logger } from '../utils/logger';
import { addScheduleJob } from '../lib/queue';
import type { Task, PrismaClient } from '@prisma/client';

/**
 * Service for synchronizing tasks with Google Calendar
 * Handles two-way sync between our task system and Google Calendar
 */
export class CalendarSyncService {
  private prisma: PrismaClient;
  private taskService: TaskService;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
    this.taskService = new TaskService(prismaClient);
  }

  /**
   * Sync a task to Google Calendar
   * Creates or updates the calendar event based on existing sync record
   *
   * @param taskId - Task ID to sync
   * @param userId - User ID who owns the task
   */
  async syncTaskToCalendar(taskId: string, userId: string): Promise<void> {
    try {
      // Get task with full details
      const task = await this.taskService.getTaskById(taskId, userId);

      if (!task) {
        logger.warn('Task not found for calendar sync', { taskId, userId });
        return;
      }

      // Check if user has Google Calendar connected
      const googleService = new GoogleCalendarService(userId);
      const hasCredentials = await googleService.hasValidCredentials();

      if (!hasCredentials) {
        logger.debug('User has no Google credentials, skipping sync', { userId });
        return;
      }

      // Check for existing calendar sync record
      const calendarIntegration = await this.prisma.calendarIntegration.findFirst({
        where: {
          userId,
          provider: 'GOOGLE',
          syncEnabled: true,
        },
      });

      if (!calendarIntegration) {
        logger.debug('Calendar integration not enabled for user', { userId });
        return;
      }

      // Look for existing sync record
      const existingSync = await this.prisma.taskCalendarSync.findUnique({
        where: {
          taskId_calendarIntegrationId: {
            taskId,
            calendarIntegrationId: calendarIntegration.id,
          },
        },
      });

      try {
        if (existingSync) {
          // Update existing event
          await googleService.updateTaskEvent(existingSync.externalEventId, {
            id: task.id,
            title: task.title,
            description: task.description || undefined,
            dueDate: task.dueDate,
            estimatedMinutes: task.estimatedMinutes || undefined,
          });

          // Update sync record
          await this.prisma.taskCalendarSync.update({
            where: { id: existingSync.id },
            data: {
              lastSyncedAt: new Date(),
              syncHash: this.generateSyncHash(task),
            },
          });

          logger.info('Updated task in Google Calendar', {
            taskId,
            eventId: existingSync.externalEventId,
          });
        } else {
          // Create new event
          const eventId = await googleService.createTaskEvent({
            id: task.id,
            title: task.title,
            description: task.description || undefined,
            dueDate: task.dueDate,
            estimatedMinutes: task.estimatedMinutes || undefined,
          });

          // Create sync record
          await this.prisma.taskCalendarSync.create({
            data: {
              taskId,
              calendarIntegrationId: calendarIntegration.id,
              externalEventId: eventId,
              syncHash: this.generateSyncHash(task),
            },
          });

          logger.info('Created task in Google Calendar', { taskId, eventId });
        }
      } catch (error: any) {
        // Handle invalid_grant error
        if (error.response?.data?.error === 'invalid_grant') {
          logger.warn('Google Calendar sync failed - invalid grant', { userId });

          // Disable sync for this user
          await this.prisma.calendarIntegration.update({
            where: { id: calendarIntegration.id },
            data: { syncEnabled: false },
          });

          // Could queue a notification to inform the user
          return;
        }

        throw error; // Re-throw other errors
      }
    } catch (error) {
      logger.error(
        'Failed to sync task to calendar',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          taskId,
          userId,
        },
      );
      // Don't throw - calendar sync should not fail task operations
    }
  }

  /**
   * Remove a task from Google Calendar
   *
   * @param taskId - Task ID to remove
   * @param userId - User ID who owns the task
   */
  async removeTaskFromCalendar(taskId: string, userId: string): Promise<void> {
    try {
      // Find sync record
      const syncRecord = await this.prisma.taskCalendarSync.findFirst({
        where: {
          taskId,
          calendarIntegration: {
            userId,
            provider: 'GOOGLE',
          },
        },
        include: {
          calendarIntegration: true,
        },
      });

      if (!syncRecord) {
        logger.debug('No calendar sync record found for task', { taskId });
        return;
      }

      const googleService = new GoogleCalendarService(userId);

      try {
        await googleService.deleteTaskEvent(syncRecord.externalEventId);

        // Delete sync record
        await this.prisma.taskCalendarSync.delete({
          where: { id: syncRecord.id },
        });

        logger.info('Removed task from Google Calendar', {
          taskId,
          eventId: syncRecord.externalEventId,
        });
      } catch (error: any) {
        // If event is already deleted in Google, just clean up our record
        if (error.code === 404 || error.response?.status === 404) {
          await this.prisma.taskCalendarSync.delete({
            where: { id: syncRecord.id },
          });
          return;
        }

        // Handle invalid_grant
        if (error.response?.data?.error === 'invalid_grant') {
          logger.warn('Google Calendar sync failed - invalid grant', { userId });
          return;
        }

        throw error;
      }
    } catch (error) {
      logger.error(
        'Failed to remove task from calendar',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          taskId,
          userId,
        },
      );
    }
  }

  /**
   * Sync all tasks for a user
   * Used for initial sync or re-sync operations
   *
   * @param userId - User ID to sync tasks for
   * @param options - Sync options
   */
  async syncAllUserTasks(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {},
  ): Promise<{ synced: number; failed: number }> {
    const results = { synced: 0, failed: 0 };

    try {
      // Get user's organization
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get user's tasks
      const tasks = await this.prisma.task.findMany({
        where: {
          organizationId: user.organizationId,
          assignments: {
            some: { userId },
          },
          status: {
            in: ['PLANNED', 'IN_PROGRESS'], // Don't sync completed tasks
          },
          dueDate: {
            gte: options.startDate || new Date(),
            lte: options.endDate,
          },
        },
        take: options.limit || 100,
        orderBy: { dueDate: 'asc' },
      });

      // Sync each task
      for (const task of tasks) {
        try {
          await this.syncTaskToCalendar(task.id, userId);
          results.synced++;
        } catch (error) {
          results.failed++;
          logger.error(
            'Failed to sync individual task',
            error instanceof Error ? error : new Error('Unknown error'),
            {
              taskId: task.id,
            },
          );
        }
      }

      logger.info('Completed bulk task sync', { userId, ...results });
    } catch (error) {
      logger.error(
        'Failed to sync all user tasks',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          userId,
        },
      );
    }

    return results;
  }

  /**
   * Enable calendar sync for a user
   * Creates or updates the calendar integration record
   *
   * @param userId - User ID
   */
  async enableCalendarSync(userId: string): Promise<void> {
    await this.prisma.calendarIntegration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: 'GOOGLE',
        },
      },
      update: {
        syncEnabled: true,
        lastSyncAt: new Date(),
      },
      create: {
        userId,
        provider: 'GOOGLE',
        syncEnabled: true,
        lastSyncAt: new Date(),
        accessToken: '', // Will be set by GoogleCalendarService
        refreshToken: '', // Will be set by GoogleCalendarService
        tokenExpiresAt: new Date(), // Will be set by GoogleCalendarService
      },
    });

    // Queue initial sync job
    await addScheduleJob({
      type: 'process-schedule',
      scheduleId: 'calendar-sync-initial',
      organizationId: userId, // Using userId as a placeholder
      occurrenceDate: new Date().toISOString(),
      data: {
        action: 'initial-calendar-sync',
        userId,
      },
    });
  }

  /**
   * Disable calendar sync for a user
   *
   * @param userId - User ID
   */
  async disableCalendarSync(userId: string): Promise<void> {
    await this.prisma.calendarIntegration.updateMany({
      where: {
        userId,
        provider: 'GOOGLE',
      },
      data: {
        syncEnabled: false,
      },
    });
  }

  /**
   * Generate a hash of task data for change detection
   *
   * @param task - Task object
   * @returns Hash string
   */
  private generateSyncHash(task: Partial<Task>): string {
    const data = {
      title: task.title,
      description: task.description,
      dueDate: task.dueDate?.toISOString(),
      estimatedMinutes: task.estimatedMinutes,
      status: task.status,
    };

    // Simple hash using JSON stringify
    // In production, consider using crypto.createHash
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  /**
   * Check if a task needs syncing based on hash comparison
   *
   * @param taskId - Task ID
   * @param currentTask - Current task data
   * @returns True if task has changed
   */
  async taskNeedsSync(taskId: string, currentTask: Partial<Task>): Promise<boolean> {
    const syncRecord = await this.prisma.taskCalendarSync.findFirst({
      where: { taskId },
    });

    if (!syncRecord) {
      return true; // No sync record means it needs syncing
    }

    const currentHash = this.generateSyncHash(currentTask);
    return syncRecord.syncHash !== currentHash;
  }
}
