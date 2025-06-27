import { type PrismaClient, type Schedule, ScheduleType, type Prisma } from '@prisma/client';
import { RRule, rrulestr } from 'rrule';
import { addScheduleJob } from '../lib/queue';
import { logger } from '../utils/logger';
import { TaskService } from './task.service';
import { NotificationService } from './notification.service';
import { NotFoundError, ValidationError } from '../utils/errors';
// import { AdvancedScheduleService } from './advanced-schedule.service'; // TODO: Use for Phase 3 features

export interface CreateScheduleInput {
  organizationId: string;
  assetId?: string;
  name: string;
  description?: string;
  scheduleType: ScheduleType;
  type?: string;
  startDate: Date;
  endDate?: Date;
  intervalDays?: number;
  intervalMonths?: number;
  customRrule?: string;
  recurrenceRule?: string;
  monthlyDayOfMonth?: number;
  seasonalMonths?: number[];
  usageThreshold?: number;
  taskTemplate: Prisma.JsonValue;
  autoCreateAdvance?: number;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  scheduleType?: ScheduleType;
  startDate?: Date;
  endDate?: Date;
  intervalDays?: number;
  intervalMonths?: number;
  customRrule?: string;
  taskTemplate?: Prisma.JsonValue;
  autoCreateAdvance?: number;
  isActive?: boolean;
}

export interface ScheduleOccurrence {
  date: Date;
  scheduleId: string;
  taskData: Prisma.JsonValue;
}

/**
 * Service for managing maintenance schedules and task generation.
 * Supports various schedule types including fixed intervals, calendar-based,
 * and usage-based schedules with automatic task creation.
 *
 * @class ScheduleService
 */
export class ScheduleService {
  private taskService: TaskService;
  private notificationService: NotificationService;
  // private advancedScheduleService: AdvancedScheduleService; // TODO: Use for Phase 3 features

  /**
   * Creates an instance of ScheduleService.
   * @param {PrismaClient} prisma - Prisma client instance
   */
  constructor(private prisma: PrismaClient) {
    this.taskService = new TaskService();
    this.notificationService = new NotificationService(prisma);
    // this.advancedScheduleService = new AdvancedScheduleService(prisma); // TODO: Use for Phase 3 features
  }

  /**
   * Create a new schedule with validation and automatic job scheduling.
   * Calculates the first occurrence and sets up queue jobs for task generation.
   *
   * @param {CreateScheduleInput} input - Schedule creation data
   * @returns {Promise<Schedule>} The created schedule
   * @throws {Error} If asset not found or doesn't belong to organization
   *
   * @example
   * // Create a monthly maintenance schedule
   * const schedule = await scheduleService.createSchedule({
   *   organizationId: 'org-123',
   *   assetId: 'asset-456',
   *   name: 'Monthly Filter Replacement',
   *   scheduleType: 'FIXED_INTERVAL',
   *   startDate: new Date('2024-01-01'),
   *   intervalMonths: 1,
   *   taskTemplate: {
   *     title: 'Replace air filter',
   *     priority: 'MEDIUM',
   *     estimatedMinutes: 30
   *   },
   *   autoCreateAdvance: 7 // Create tasks 7 days in advance
   * });
   */
  async createSchedule(input: CreateScheduleInput): Promise<Schedule> {
    const { organizationId, assetId, ...scheduleData } = input;

    // Validate the asset exists and belongs to the organization
    if (assetId) {
      const asset = await this.prisma.asset.findFirst({
        where: {
          id: assetId,
          organizationId,
        },
      });

      if (!asset) {
        throw new Error('Asset not found or does not belong to organization');
      }
    }

    // Calculate the first next occurrence
    const nextOccurrence = this.calculateNextOccurrence({
      ...input,
      startDate: input.startDate,
    });

    const schedule = await this.prisma.schedule.create({
      data: {
        organizationId,
        assetId,
        name: scheduleData.name,
        description: scheduleData.description,
        scheduleType: scheduleData.scheduleType,
        type: scheduleData.type || scheduleData.scheduleType,
        startDate: scheduleData.startDate,
        endDate: scheduleData.endDate,
        intervalDays: scheduleData.intervalDays,
        intervalMonths: scheduleData.intervalMonths,
        customRrule: scheduleData.customRrule,
        recurrenceRule: scheduleData.recurrenceRule,
        monthlyDayOfMonth: scheduleData.monthlyDayOfMonth,
        seasonalMonths: scheduleData.seasonalMonths
          ? (scheduleData.seasonalMonths as Prisma.InputJsonValue)
          : undefined,
        usageThreshold: scheduleData.usageThreshold,
        nextOccurrence,
        taskTemplate: scheduleData.taskTemplate as Prisma.InputJsonValue,
        autoCreateAdvance: scheduleData.autoCreateAdvance || 7,
      },
    });

    logger.info('Schedule created', {
      scheduleId: schedule.id,
      organizationId,
      assetId,
      scheduleType: schedule.scheduleType,
      nextOccurrence,
    });

    // Schedule the first job for task generation
    if (schedule.isActive && nextOccurrence) {
      await this.scheduleNextOccurrence(schedule);
    }

    return schedule;
  }

  /**
   * Get schedule by ID with optional asset inclusion.
   *
   * @param {string} id - Schedule ID
   * @param {string} organizationId - Organization ID for access control
   * @param {Object} [options={}] - Query options
   * @param {boolean} [options.includeAsset] - Include related asset data
   * @returns {Promise<Schedule | null>} The schedule or null if not found
   *
   * @example
   * const schedule = await scheduleService.getScheduleById(
   *   'schedule-123',
   *   'org-456',
   *   { includeAsset: true }
   * );
   */
  async getScheduleById(
    id: string,
    organizationId: string,
    options: { includeAsset?: boolean } = {},
  ): Promise<Schedule | null> {
    return this.prisma.schedule.findFirst({
      where: {
        id,
        organizationId,
      },
      include: options.includeAsset
        ? {
            asset: true,
          }
        : undefined,
    });
  }

  /**
   * List schedules with filtering and pagination.
   * Returns schedules sorted by next occurrence date.
   *
   * @param {string} organizationId - Organization ID
   * @param {Object} [options={}] - Filter and pagination options
   * @param {string} [options.assetId] - Filter by asset ID
   * @param {boolean} [options.isActive] - Filter by active status
   * @param {ScheduleType} [options.scheduleType] - Filter by schedule type
   * @param {number} [options.limit=50] - Results per page
   * @param {number} [options.offset=0] - Skip number of results
   * @returns {Promise<Object>} Schedules array and total count
   *
   * @example
   * const { schedules, total } = await scheduleService.listSchedules('org-123', {
   *   isActive: true,
   *   scheduleType: 'FIXED_INTERVAL',
   *   limit: 20
   * });
   */
  async listSchedules(
    organizationId: string,
    options: {
      assetId?: string;
      isActive?: boolean;
      scheduleType?: ScheduleType;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ schedules: Schedule[]; total: number }> {
    const where = {
      organizationId,
      ...(options.assetId && { assetId: options.assetId }),
      ...(options.isActive !== undefined && { isActive: options.isActive }),
      ...(options.scheduleType && { scheduleType: options.scheduleType }),
    };

    const [schedules, total] = await Promise.all([
      this.prisma.schedule.findMany({
        where,
        include: {
          asset: true,
        },
        orderBy: {
          nextOccurrence: 'asc',
        },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      this.prisma.schedule.count({ where }),
    ]);

    return { schedules, total };
  }

  /**
   * Update a schedule with recalculation of next occurrence.
   * Reschedules queue jobs if timing changes.
   *
   * @param {string} id - Schedule ID to update
   * @param {string} organizationId - Organization ID for access control
   * @param {UpdateScheduleInput} input - Update data
   * @returns {Promise<Schedule>} The updated schedule
   * @throws {Error} If schedule not found
   *
   * @example
   * // Change schedule interval
   * const updated = await scheduleService.updateSchedule(
   *   'schedule-123',
   *   'org-456',
   *   {
   *     intervalDays: 14, // Change from monthly to bi-weekly
   *     intervalMonths: null
   *   }
   * );
   */
  async updateSchedule(
    id: string,
    organizationId: string,
    input: UpdateScheduleInput,
  ): Promise<Schedule> {
    const existingSchedule = await this.getScheduleById(id, organizationId);
    if (!existingSchedule) {
      throw new Error('Schedule not found');
    }

    // If schedule type or timing data changed, recalculate next occurrence
    let nextOccurrence = existingSchedule.nextOccurrence;
    if (
      input.scheduleType ||
      input.startDate ||
      input.endDate ||
      input.intervalDays ||
      input.intervalMonths ||
      input.customRrule
    ) {
      nextOccurrence = this.calculateNextOccurrence({
        scheduleType: input.scheduleType || existingSchedule.scheduleType,
        startDate: input.startDate || existingSchedule.startDate,
        endDate: input.endDate !== undefined ? input.endDate : existingSchedule.endDate,
        intervalDays:
          input.intervalDays !== undefined ? input.intervalDays : existingSchedule.intervalDays,
        intervalMonths:
          input.intervalMonths !== undefined
            ? input.intervalMonths
            : existingSchedule.intervalMonths,
        customRrule:
          input.customRrule !== undefined ? input.customRrule : existingSchedule.customRrule,
      });
    }

    const updateData: Prisma.ScheduleUpdateInput = {
      nextOccurrence,
    };

    // Add only the defined fields to avoid type issues
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.scheduleType !== undefined) updateData.scheduleType = input.scheduleType;
    if (input.startDate !== undefined) updateData.startDate = input.startDate;
    if (input.endDate !== undefined) updateData.endDate = input.endDate;
    if (input.intervalDays !== undefined) updateData.intervalDays = input.intervalDays;
    if (input.intervalMonths !== undefined) updateData.intervalMonths = input.intervalMonths;
    if (input.customRrule !== undefined) updateData.customRrule = input.customRrule;
    if (input.taskTemplate !== undefined)
      updateData.taskTemplate = input.taskTemplate as Prisma.InputJsonValue;
    if (input.autoCreateAdvance !== undefined)
      updateData.autoCreateAdvance = input.autoCreateAdvance;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    const schedule = await this.prisma.schedule.update({
      where: { id },
      data: updateData,
    });

    logger.info('Schedule updated', {
      scheduleId: id,
      organizationId,
      changes: Object.keys(input),
    });

    // Reschedule jobs if the schedule is still active
    if (schedule.isActive && nextOccurrence) {
      await this.scheduleNextOccurrence(schedule);
    }

    return schedule;
  }

  /**
   * Delete a schedule.
   * Removes all associated queue jobs.
   *
   * @param {string} id - Schedule ID to delete
   * @param {string} organizationId - Organization ID for access control
   * @returns {Promise<void>}
   * @throws {Error} If schedule not found
   *
   * @example
   * await scheduleService.deleteSchedule('schedule-123', 'org-456');
   */
  async deleteSchedule(id: string, organizationId: string): Promise<void> {
    const schedule = await this.getScheduleById(id, organizationId);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    await this.prisma.schedule.delete({
      where: { id },
    });

    logger.info('Schedule deleted', {
      scheduleId: id,
      organizationId,
    });
  }

  /**
   * Calculate the next occurrence for a schedule.
   * Uses RRULE library for complex recurrence patterns.
   *
   * @param {Object} schedule - Schedule configuration
   * @param {ScheduleType} schedule.scheduleType - Type of schedule
   * @param {Date} schedule.startDate - Schedule start date
   * @param {Date | null} [schedule.endDate] - Optional end date
   * @param {number | null} [schedule.intervalDays] - Days between occurrences
   * @param {number | null} [schedule.intervalMonths] - Months between occurrences
   * @param {string | null} [schedule.customRrule] - Custom RRULE string
   * @returns {Date | null} Next occurrence date or null if no more occurrences
   * @private
   */
  private calculateNextOccurrence(schedule: {
    scheduleType: ScheduleType;
    startDate: Date;
    endDate?: Date | null;
    intervalDays?: number | null;
    intervalMonths?: number | null;
    customRrule?: string | null;
  }): Date | null {
    const now = new Date();
    const startDate = schedule.startDate;

    if (startDate <= now && schedule.scheduleType === ScheduleType.ONE_OFF) {
      // One-off schedule in the past has no next occurrence
      return null;
    }

    if (schedule.scheduleType === ScheduleType.ONE_OFF) {
      return startDate;
    }

    try {
      let rrule: RRule;

      if (schedule.scheduleType === ScheduleType.CUSTOM && schedule.customRrule) {
        // Parse custom RRULE
        const parsedRule = rrulestr(schedule.customRrule);
        if (!(parsedRule instanceof RRule)) {
          throw new Error('Custom RRULE must be a single rule, not a rule set');
        }
        rrule = parsedRule;
      } else if (schedule.scheduleType === ScheduleType.FIXED_INTERVAL) {
        // Build RRULE for fixed interval
        const freq = schedule.intervalMonths ? RRule.MONTHLY : RRule.DAILY;
        const interval = schedule.intervalMonths || schedule.intervalDays || 1;

        rrule = new RRule({
          freq,
          interval,
          dtstart: startDate,
          until: schedule.endDate || undefined,
        });
      } else {
        throw new Error(`Unsupported schedule type: ${schedule.scheduleType}`);
      }

      // Get the next occurrence after now
      const nextOccurrence = rrule.after(now);
      return nextOccurrence;
    } catch (error) {
      logger.error(
        `Error calculating next occurrence for schedule type: ${schedule.scheduleType}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  /**
   * Get upcoming occurrences for a schedule.
   * Useful for preview and planning purposes.
   *
   * @param {string} id - Schedule ID
   * @param {string} organizationId - Organization ID for access control
   * @param {Object} [options={}] - Query options
   * @param {number} [options.limit=10] - Maximum occurrences to return
   * @param {number} [options.days=365] - Days ahead to look for occurrences
   * @returns {Promise<ScheduleOccurrence[]>} Array of upcoming occurrences
   * @throws {Error} If schedule not found
   *
   * @example
   * // Get next 5 occurrences within 90 days
   * const occurrences = await scheduleService.getUpcomingOccurrences(
   *   'schedule-123',
   *   'org-456',
   *   { limit: 5, days: 90 }
   * );
   */
  async getUpcomingOccurrences(
    id: string,
    organizationId: string,
    options: { limit?: number; days?: number } = {},
  ): Promise<ScheduleOccurrence[]> {
    const schedule = await this.getScheduleById(id, organizationId);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const limit = options.limit || 10;
    const days = options.days || 365; // Default to 1 year
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    if (schedule.scheduleType === ScheduleType.ONE_OFF) {
      if (schedule.startDate > new Date() && schedule.startDate <= endDate) {
        return [
          {
            date: schedule.startDate,
            scheduleId: schedule.id,
            taskData: schedule.taskTemplate,
          },
        ];
      }
      return [];
    }

    try {
      let rrule: RRule;

      if (schedule.scheduleType === ScheduleType.CUSTOM && schedule.customRrule) {
        const parsedRule = rrulestr(schedule.customRrule);
        if (!(parsedRule instanceof RRule)) {
          throw new Error('Custom RRULE must be a single rule, not a rule set');
        }
        rrule = parsedRule;
      } else if (schedule.scheduleType === ScheduleType.FIXED_INTERVAL) {
        const freq = schedule.intervalMonths ? RRule.MONTHLY : RRule.DAILY;
        const interval = schedule.intervalMonths || schedule.intervalDays || 1;

        rrule = new RRule({
          freq,
          interval,
          dtstart: schedule.startDate,
          until: schedule.endDate || endDate,
        });
      } else {
        return [];
      }

      const occurrences = rrule.between(new Date(), endDate, true);

      return occurrences.slice(0, limit).map((date) => ({
        date,
        scheduleId: schedule.id,
        taskData: schedule.taskTemplate,
      }));
    } catch (error) {
      logger.error(
        `Error getting upcoming occurrences for schedule: ${id}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return [];
    }
  }

  /**
   * Process a schedule occurrence (called by the worker).
   * Creates a task, updates schedule metadata, and schedules next occurrence.
   *
   * @param {string} scheduleId - Schedule ID to process
   * @param {Date} occurrenceDate - Date of the occurrence
   * @returns {Promise<void>}
   *
   * @example
   * // Usually called by queue worker
   * await scheduleService.processOccurrence('schedule-123', new Date());
   */
  async processOccurrence(scheduleId: string, occurrenceDate: Date): Promise<void> {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { asset: true },
    });

    if (!schedule) {
      logger.error(`Schedule not found for processing: ${scheduleId}`);
      return;
    }

    if (!schedule.isActive) {
      logger.info('Schedule is inactive, skipping occurrence', { scheduleId });
      return;
    }

    logger.info('Processing schedule occurrence', {
      scheduleId,
      occurrenceDate,
      assetId: schedule.assetId,
    });

    // Create a maintenance task based on the schedule's task template
    try {
      await this.createTaskFromSchedule(schedule, occurrenceDate);
    } catch (error) {
      logger.error(
        'Failed to create task from schedule',
        error instanceof Error ? error : new Error(String(error)),
        {
          scheduleId,
          occurrenceDate,
        },
      );

      // Still continue with schedule processing even if task creation fails
      // This ensures the schedule isn't stuck
    }

    // Update schedule metadata
    const nextOccurrence = this.calculateNextOccurrence({
      scheduleType: schedule.scheduleType,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      intervalDays: schedule.intervalDays,
      intervalMonths: schedule.intervalMonths,
      customRrule: schedule.customRrule,
    });
    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        lastOccurrence: occurrenceDate,
        nextOccurrence,
      },
    });

    // Schedule the next occurrence if there is one
    if (nextOccurrence) {
      const updatedSchedule = { ...schedule, nextOccurrence };
      await this.scheduleNextOccurrence(updatedSchedule);
    }
  }

  /**
   * Schedule the next occurrence job in the queue.
   * Calculates delay based on autoCreateAdvance setting.
   *
   * @param {Schedule} schedule - Schedule to process
   * @returns {Promise<void>}
   * @private
   */
  private async scheduleNextOccurrence(schedule: Schedule): Promise<void> {
    if (!schedule.nextOccurrence || !schedule.isActive) {
      return;
    }

    const now = new Date();
    const advanceMs = (schedule.autoCreateAdvance || 7) * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const scheduleTime = new Date(schedule.nextOccurrence.getTime() - advanceMs);

    // Only schedule if the schedule time is in the future
    if (scheduleTime <= now) {
      // If we're past the advance time, schedule immediately
      await addScheduleJob(
        {
          type: 'process-schedule',
          scheduleId: schedule.id,
          organizationId: schedule.organizationId,
          assetId: schedule.assetId || undefined,
          occurrenceDate: schedule.nextOccurrence.toISOString(),
        },
        { delay: 0 },
      );
    } else {
      // Schedule for the future
      const delay = scheduleTime.getTime() - now.getTime();
      await addScheduleJob(
        {
          type: 'process-schedule',
          scheduleId: schedule.id,
          organizationId: schedule.organizationId,
          assetId: schedule.assetId || undefined,
          occurrenceDate: schedule.nextOccurrence.toISOString(),
        },
        { delay },
      );
    }

    logger.debug('Scheduled next occurrence job', {
      scheduleId: schedule.id,
      nextOccurrence: schedule.nextOccurrence,
      scheduleTime,
      delay: Math.max(0, scheduleTime.getTime() - now.getTime()),
    });
  }

  /**
   * Create a task from a schedule occurrence.
   * Uses task template to populate task fields and sends notifications.
   *
   * @param {Schedule & { asset? }} schedule - Schedule with optional asset data
   * @param {Date} occurrenceDate - Due date for the task
   * @returns {Promise<void>}
   * @throws {Error} If task template is invalid or missing required fields
   * @private
   */
  private async createTaskFromSchedule(
    schedule: Schedule & { asset?: { id: string; name: string } | null },
    occurrenceDate: Date,
  ): Promise<void> {
    // Parse the task template from the schedule
    const taskTemplate = schedule.taskTemplate as any;

    if (!taskTemplate || typeof taskTemplate !== 'object') {
      throw new Error('Invalid task template in schedule');
    }

    // Extract task data from template
    const {
      title,
      description,
      priority = 'MEDIUM',
      estimatedCost,
      estimatedMinutes,
      assignUserIds = [],
    } = taskTemplate;

    if (!title) {
      throw new Error('Task template must include a title');
    }

    // Create the task
    const task = await this.taskService.createTask({
      organizationId: schedule.organizationId,
      title: typeof title === 'string' ? title : String(title),
      description: description ? String(description) : undefined,
      dueDate: occurrenceDate,
      priority,
      estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      assetId: schedule.assetId || undefined,
      scheduleId: schedule.id,
      assignUserIds: Array.isArray(assignUserIds) ? assignUserIds : [],
    });

    logger.info('Task created from schedule', {
      scheduleId: schedule.id,
      taskId: task.id,
      assetId: schedule.assetId,
      dueDate: occurrenceDate,
      title: task.title,
    });

    // Send notifications for task assignment
    if (task.assignments && task.assignments.length > 0) {
      for (const assignment of task.assignments) {
        try {
          await this.notificationService.createNotification({
            organizationId: schedule.organizationId,
            userId: assignment.user.id,
            taskId: task.id,
            assetId: schedule.assetId || undefined,
            type: 'task-assigned',
            title: 'New Task Assigned',
            message: `You have been assigned a new task: ${task.title}${
              schedule.asset ? ` for asset ${schedule.asset.name}` : ''
            }`,
            sendInApp: true,
          });
        } catch (notificationError) {
          logger.warn('Failed to send task assignment notification', {
            taskId: task.id,
            userId: assignment.user.id,
            error: notificationError instanceof Error ? notificationError.message : 'Unknown error',
          });
        }
      }
    }
  }

  /**
   * Get schedules that need task generation (for manual processing).
   * Returns active schedules with past next occurrence dates.
   *
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Schedule[]>} Schedules requiring task generation
   *
   * @example
   * const pendingSchedules = await scheduleService.getSchedulesNeedingTasks('org-123');
   * console.log(`${pendingSchedules.length} schedules need processing`);
   */
  async getSchedulesNeedingTasks(organizationId: string): Promise<Schedule[]> {
    const now = new Date();
    const schedules = await this.prisma.schedule.findMany({
      where: {
        organizationId,
        isActive: true,
        nextOccurrence: {
          lte: now,
        },
      },
      include: {
        asset: {
          select: { id: true, name: true },
        },
      },
    });

    return schedules;
  }

  /**
   * Process all pending schedule occurrences (for manual processing).
   * Useful for batch processing or recovery from queue failures.
   *
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Processing results with counts and errors
   *
   * @example
   * const results = await scheduleService.processPendingOccurrences('org-123');
   * console.log(`Processed: ${results.processed}, Failed: ${results.failed}`);
   * if (results.failed > 0) {
   *   console.error('Errors:', results.errors);
   * }
   */
  async processPendingOccurrences(organizationId: string): Promise<{
    processed: number;
    failed: number;
    errors: string[];
  }> {
    const schedules = await this.getSchedulesNeedingTasks(organizationId);

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const schedule of schedules) {
      try {
        if (schedule.nextOccurrence) {
          await this.processOccurrence(schedule.id, schedule.nextOccurrence);
          processed++;
        }
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Schedule ${schedule.id}: ${errorMessage}`);
        logger.error(
          'Failed to process schedule occurrence',
          error instanceof Error ? error : new Error(errorMessage),
          {
            scheduleId: schedule.id,
          },
        );
      }
    }

    logger.info('Processed pending schedule occurrences', {
      organizationId,
      processed,
      failed,
      total: schedules.length,
    });

    return { processed, failed, errors };
  }

  /**
   * Validate schedule configuration based on type.
   * Ensures required fields are present for each schedule type.
   *
   * @param {any} config - Schedule configuration to validate
   * @returns {Promise<void>}
   * @throws {ValidationError} If configuration is invalid for the type
   *
   * @example
   * await scheduleService.validateScheduleConfig({
   *   type: 'INTERVAL',
   *   intervalDays: 30
   * });
   */
  async validateScheduleConfig(config: any): Promise<void> {
    const {
      type,
      intervalDays,
      recurrenceRule,
      monthlyDayOfMonth,
      seasonalMonths,
      usageThreshold,
    } = config;

    switch (type) {
      case 'INTERVAL':
        if (!intervalDays) {
          throw new ValidationError('intervalDays is required for INTERVAL schedules');
        }
        break;
      case 'CALENDAR':
        if (!recurrenceRule) {
          throw new ValidationError('recurrenceRule is required for CALENDAR schedules');
        }
        try {
          RRule.fromString(recurrenceRule);
        } catch (error) {
          throw new ValidationError('Invalid recurrence rule format');
        }
        break;
      case 'MONTHLY':
        if (!monthlyDayOfMonth) {
          throw new ValidationError('monthlyDayOfMonth is required for MONTHLY schedules');
        }
        break;
      case 'SEASONAL':
        if (!seasonalMonths || seasonalMonths.length === 0) {
          throw new ValidationError('seasonalMonths is required for SEASONAL schedules');
        }
        break;
      case 'USAGE_BASED':
        if (!usageThreshold) {
          throw new ValidationError('usageThreshold is required for USAGE_BASED schedules');
        }
        break;
    }
  }

  /**
   * Generate tasks manually for a schedule.
   * Bypasses automatic scheduling and creates tasks immediately.
   *
   * @param {string} scheduleId - Schedule ID
   * @param {string} organizationId - Organization ID for access control
   * @returns {Promise<Object>} Number of tasks created and next run date
   * @throws {NotFoundError} If schedule not found
   * @throws {ValidationError} If schedule is not active
   *
   * @example
   * const result = await scheduleService.generateTasksNow('schedule-123', 'org-456');
   * console.log(`Created ${result.tasksCreated} tasks`);
   * console.log(`Next run: ${result.nextRunAt}`);
   */
  async generateTasksNow(
    scheduleId: string,
    organizationId: string,
  ): Promise<{ tasksCreated: number; nextRunAt: Date | null }> {
    const schedule = await this.getScheduleById(scheduleId, organizationId, { includeAsset: true });
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    if (!schedule.isActive) {
      throw new ValidationError('Schedule is not active');
    }

    // Get next occurrence
    const nextOccurrences = await this.getNextOccurrences(schedule, 1);
    if (nextOccurrences.length === 0) {
      return { tasksCreated: 0, nextRunAt: null };
    }

    const nextOccurrence = nextOccurrences[0]!; // We know it exists from the check above

    // Create task
    await this.createTaskFromSchedule(schedule, nextOccurrence);

    // Update lastRunAt and nextRunAt
    const futureOccurrences = await this.getNextOccurrences(
      schedule,
      1,
      new Date(nextOccurrence.getTime() + 1),
    );
    const nextRunAt: Date | null = futureOccurrences.length > 0 ? futureOccurrences[0]! : null;

    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: new Date(),
        nextRunAt: nextRunAt || null,
      },
    });

    return { tasksCreated: 1, nextRunAt };
  }

  /**
   * Get all schedules for a specific asset.
   *
   * @param {string} assetId - Asset ID to filter by
   * @param {string} organizationId - Organization ID for access control
   * @param {boolean} [isActive] - Optional filter by active status
   * @returns {Promise<Schedule[]>} Array of schedules for the asset
   *
   * @example
   * // Get all active schedules for an asset
   * const schedules = await scheduleService.getSchedulesByAsset(
   *   'asset-123',
   *   'org-456',
   *   true
   * );
   */
  async getSchedulesByAsset(
    assetId: string,
    organizationId: string,
    isActive?: boolean,
  ): Promise<Schedule[]> {
    const whereClause: any = {
      assetId,
      organizationId,
    };

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    return this.prisma.schedule.findMany({
      where: whereClause,
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Activate a schedule.
   * Calculates next occurrence and sets up queue jobs.
   *
   * @param {string} scheduleId - Schedule ID to activate
   * @param {string} organizationId - Organization ID for access control
   * @returns {Promise<Schedule>} The activated schedule
   * @throws {NotFoundError} If schedule not found
   *
   * @example
   * const activated = await scheduleService.activateSchedule('schedule-123', 'org-456');
   */
  async activateSchedule(scheduleId: string, organizationId: string): Promise<Schedule> {
    const schedule = await this.getScheduleById(scheduleId, organizationId);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    if (schedule.isActive) {
      return schedule;
    }

    // Calculate next occurrence
    const nextOccurrences = await this.getNextOccurrences(schedule, 1);
    const nextRunAt = nextOccurrences.length > 0 ? nextOccurrences[0] : null;

    return this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        isActive: true,
        nextRunAt,
      },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });
  }

  /**
   * Deactivate a schedule.
   * Stops automatic task generation.
   *
   * @param {string} scheduleId - Schedule ID to deactivate
   * @param {string} organizationId - Organization ID for access control
   * @returns {Promise<Schedule>} The deactivated schedule
   * @throws {NotFoundError} If schedule not found
   *
   * @example
   * const deactivated = await scheduleService.deactivateSchedule('schedule-123', 'org-456');
   */
  async deactivateSchedule(scheduleId: string, organizationId: string): Promise<Schedule> {
    const schedule = await this.getScheduleById(scheduleId, organizationId);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    return this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        isActive: false,
        nextRunAt: null,
      },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });
  }

  /**
   * Get next occurrences of a schedule.
   * Calculates dates based on schedule type and configuration.
   *
   * @param {Schedule} schedule - Schedule to calculate occurrences for
   * @param {number} [count=10] - Number of occurrences to return
   * @param {Date} [startDate=new Date()] - Start date for calculation
   * @param {Date} [endDate] - Optional end date limit
   * @returns {Promise<Date[]>} Array of occurrence dates
   *
   * @example
   * const nextDates = await scheduleService.getNextOccurrences(
   *   schedule,
   *   5,
   *   new Date('2024-01-01')
   * );
   */
  async getNextOccurrences(
    schedule: Schedule,
    count: number = 10,
    startDate: Date = new Date(),
    endDate?: Date,
  ): Promise<Date[]> {
    const occurrences: Date[] = [];

    switch (schedule.type) {
      case 'INTERVAL':
        if (!schedule.intervalDays) break;
        const currentDate = new Date(startDate);
        while (occurrences.length < count && (!endDate || currentDate <= endDate)) {
          occurrences.push(new Date(currentDate));
          currentDate.setDate(currentDate.getDate() + schedule.intervalDays);
        }
        break;

      case 'CALENDAR':
        if (!schedule.recurrenceRule) break;
        try {
          const rule = RRule.fromString(schedule.recurrenceRule);
          const dates = rule.between(
            startDate,
            endDate || new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000),
          );
          occurrences.push(...dates.slice(0, count));
        } catch (error) {
          logger.error(
            'Invalid recurrence rule',
            error instanceof Error ? error : new Error(String(error)),
          );
        }
        break;

      case 'MONTHLY':
        if (!schedule.monthlyDayOfMonth) break;
        const monthDate = new Date(startDate);
        while (occurrences.length < count && (!endDate || monthDate <= endDate)) {
          monthDate.setDate(schedule.monthlyDayOfMonth);
          if (monthDate >= startDate) {
            occurrences.push(new Date(monthDate));
          }
          monthDate.setMonth(monthDate.getMonth() + 1);
        }
        break;

      case 'SEASONAL':
        if (
          !schedule.seasonalMonths ||
          (Array.isArray(schedule.seasonalMonths) && schedule.seasonalMonths.length === 0)
        )
          break;
        const seasonDate = new Date(startDate);
        const seasonalMonthsArray = Array.isArray(schedule.seasonalMonths)
          ? schedule.seasonalMonths
          : JSON.parse(schedule.seasonalMonths as any);

        while (occurrences.length < count && (!endDate || seasonDate <= endDate)) {
          if (seasonalMonthsArray.includes(seasonDate.getMonth() + 1)) {
            occurrences.push(new Date(seasonDate));
          }
          seasonDate.setMonth(seasonDate.getMonth() + 1);
          seasonDate.setDate(1); // First day of month
        }
        break;

      case 'USAGE_BASED':
        // Usage-based schedules don't have predetermined occurrences
        break;
    }

    // Filter by schedule start/end dates
    return occurrences.filter((date) => {
      if (schedule.startDate && date < schedule.startDate) return false;
      if (schedule.endDate && date > schedule.endDate) return false;
      return true;
    });
  }

  /**
   * Find schedules with filtering and pagination.
   * Provides flexible search with multiple filter criteria.
   *
   * @param {string} organizationId - Organization ID
   * @param {Object} [options={}] - Search and pagination options
   * @param {string} [options.assetId] - Filter by asset ID
   * @param {ScheduleType} [options.type] - Filter by schedule type
   * @param {boolean} [options.isActive] - Filter by active status
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=20] - Results per page
   * @param {string} [options.sortBy='createdAt'] - Sort field
   * @param {'asc' | 'desc'} [options.sortOrder='desc'] - Sort direction
   * @param {boolean} [options.includeAsset] - Include asset relations
   * @returns {Promise<Object>} Paginated schedule results
   *
   * @example
   * const results = await scheduleService.findSchedules('org-123', {
   *   type: 'FIXED_INTERVAL',
   *   isActive: true,
   *   page: 1,
   *   limit: 50,
   *   includeAsset: true
   * });
   */
  async findSchedules(
    organizationId: string,
    options: {
      assetId?: string;
      type?: ScheduleType;
      isActive?: boolean;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      includeAsset?: boolean;
    } = {},
  ): Promise<{
    data: Schedule[];
    meta: {
      total: number;
      page: number;
      lastPage: number;
    };
  }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      organizationId,
    };

    if (options.assetId) {
      whereClause.assetId = options.assetId;
    }

    if (options.type) {
      whereClause.type = options.type;
    }

    if (options.isActive !== undefined) {
      whereClause.isActive = options.isActive;
    }

    const orderBy: any = {};
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    const [schedules, total] = await Promise.all([
      this.prisma.schedule.findMany({
        where: whereClause,
        include: options.includeAsset
          ? {
              asset: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            }
          : undefined,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.schedule.count({ where: whereClause }),
    ]);

    return {
      data: schedules,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update usage-based schedule.
   * Triggers task creation when usage threshold is reached.
   *
   * @param {string} scheduleId - Schedule ID
   * @param {string} organizationId - Organization ID for access control
   * @param {number} currentUsage - Current usage value
   * @returns {Promise<Schedule>} The updated schedule
   * @throws {NotFoundError} If schedule not found
   * @throws {ValidationError} If schedule is not usage-based
   *
   * @example
   * // Update equipment runtime hours
   * const schedule = await scheduleService.updateUsageBasedSchedule(
   *   'schedule-123',
   *   'org-456',
   *   1500 // Current runtime hours
   * );
   * // If threshold was 1000 hours, a maintenance task is created
   */
  async updateUsageBasedSchedule(
    scheduleId: string,
    organizationId: string,
    currentUsage: number,
  ): Promise<Schedule> {
    const schedule = await this.getScheduleById(scheduleId, organizationId);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    if (schedule.type !== 'USAGE_BASED') {
      throw new ValidationError('Schedule is not usage-based');
    }

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        currentUsage,
        updatedAt: new Date(),
      },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });

    // Check if usage threshold is reached
    if (schedule.usageThreshold && currentUsage >= schedule.usageThreshold) {
      // Generate task
      await this.createTaskFromSchedule(updated, new Date());

      // Reset usage counter
      await this.prisma.schedule.update({
        where: { id: scheduleId },
        data: {
          currentUsage: 0,
          lastRunAt: new Date(),
        },
      });
    }

    return updated;
  }
}
