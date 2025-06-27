import type { PrismaClient, Schedule, ScheduleRule, UsageCounter } from '@prisma/client';
import { ScheduleType } from '@prisma/client';
import { addDays, addMonths, setDate } from 'date-fns';
import { isWithinInterval } from 'date-fns/isWithinInterval';
import { RRule } from 'rrule';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError } from '../utils/errors';

interface SeasonalScheduleConfig {
  months: number[]; // Array of month numbers (1-12)
  dayOfMonth?: number; // Optional specific day of month
}

interface UsageBasedScheduleConfig {
  counterType: string;
  threshold: number;
  resetOnTrigger?: boolean;
}

interface BlackoutDatesConfig {
  dates: string[]; // ISO date strings
  ranges?: { start: string; end: string }[];
}

interface BusinessDaysConfig {
  excludeWeekends: boolean;
  excludeHolidays?: boolean;
  customHolidays?: string[]; // ISO date strings
}

interface ScheduleDependencyConfig {
  dependsOnScheduleId: string;
  offsetDays: number;
}

export class AdvancedScheduleService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a seasonal schedule that runs on specific months
   */
  async createSeasonalSchedule(
    organizationId: string,
    assetId: string,
    name: string,
    config: SeasonalScheduleConfig,
    taskTemplate: any,
  ): Promise<Schedule> {
    // Validate months
    if (!config.months || config.months.length === 0) {
      throw new ValidationError('Seasonal schedule must specify at least one month');
    }

    const invalidMonths = config.months.filter((m) => m < 1 || m > 12);
    if (invalidMonths.length > 0) {
      throw new ValidationError(`Invalid month numbers: ${invalidMonths.join(', ')}`);
    }

    // Create the schedule
    const schedule = await this.prisma.schedule.create({
      data: {
        organizationId,
        assetId,
        name,
        description: `Seasonal schedule for months: ${config.months.join(', ')}`,
        scheduleType: ScheduleType.CUSTOM,
        type: 'seasonal',
        startDate: new Date(),
        seasonalMonths: config.months,
        monthlyDayOfMonth: config.dayOfMonth,
        taskTemplate,
        isActive: true,
      },
    });

    // Calculate next occurrence
    await this.updateNextOccurrence(schedule.id);

    return schedule;
  }

  /**
   * Create a usage-based schedule that triggers based on counters
   */
  async createUsageBasedSchedule(
    organizationId: string,
    assetId: string,
    name: string,
    config: UsageBasedScheduleConfig,
    taskTemplate: any,
  ): Promise<Schedule> {
    // Create the schedule
    const schedule = await this.prisma.schedule.create({
      data: {
        organizationId,
        assetId,
        name,
        description: `Usage-based schedule: ${config.counterType} >= ${config.threshold}`,
        scheduleType: ScheduleType.CUSTOM,
        type: 'usage_based',
        usageThreshold: config.threshold,
        taskTemplate: {
          ...taskTemplate,
          usageConfig: config,
        },
        isActive: true,
        startDate: new Date(),
      },
    });

    // Create or update the usage counter
    await this.prisma.usageCounter.upsert({
      where: {
        assetId_counterType: {
          assetId,
          counterType: config.counterType,
        },
      },
      create: {
        assetId,
        scheduleId: schedule.id,
        counterType: config.counterType,
        currentValue: 0,
      },
      update: {
        scheduleId: schedule.id,
      },
    });

    return schedule;
  }

  /**
   * Add schedule rules (blackout dates, business days only, etc.)
   */
  async addScheduleRule(
    scheduleId: string,
    ruleType: 'blackout_dates' | 'business_days_only' | 'dependency',
    ruleConfig: BlackoutDatesConfig | BusinessDaysConfig | ScheduleDependencyConfig,
  ): Promise<ScheduleRule> {
    const rule = await this.prisma.scheduleRule.create({
      data: {
        scheduleId,
        ruleType,
        ruleConfig: ruleConfig as any,
        isActive: true,
      },
    });

    // If it's a dependency rule, also create the dependency record
    if (ruleType === 'dependency') {
      const depConfig = ruleConfig as ScheduleDependencyConfig;
      await this.prisma.scheduleDependency.create({
        data: {
          scheduleId,
          dependsOnScheduleId: depConfig.dependsOnScheduleId,
          offsetDays: depConfig.offsetDays || 0,
        },
      });
    }

    // Recalculate next occurrence considering new rules
    await this.updateNextOccurrence(scheduleId);

    return rule;
  }

  /**
   * Update usage counter and check if schedule should trigger
   */
  async updateUsageCounter(
    assetId: string,
    counterType: string,
    increment: number,
    notes?: string,
  ): Promise<{ counter: UsageCounter; triggered: boolean; schedule?: Schedule }> {
    const counter = await this.prisma.usageCounter.findFirst({
      where: {
        assetId,
        counterType,
      },
      include: {
        schedule: true,
      },
    });

    if (!counter) {
      throw new NotFoundError(`Usage counter not found for asset ${assetId}, type ${counterType}`);
    }

    const newValue = counter.currentValue + increment;
    const triggered = counter.schedule && newValue >= (counter.schedule.usageThreshold || 0);

    // Update the counter
    const updatedCounter = await this.prisma.usageCounter.update({
      where: { id: counter.id },
      data: {
        currentValue: newValue,
        lastUpdatedAt: new Date(),
        notes,
      },
    });

    if (triggered && counter.schedule) {
      logger.info('Usage threshold reached, triggering schedule', {
        assetId,
        counterType,
        threshold: counter.schedule.usageThreshold,
        currentValue: newValue,
      });

      // Reset counter if configured
      const usageConfig = counter.schedule.taskTemplate as any;
      if (usageConfig?.usageConfig?.resetOnTrigger) {
        await this.prisma.usageCounter.update({
          where: { id: counter.id },
          data: {
            currentValue: 0,
            lastResetAt: new Date(),
          },
        });
      }

      return { counter: updatedCounter, triggered: true, schedule: counter.schedule };
    }

    return { counter: updatedCounter, triggered: false };
  }

  /**
   * Calculate next occurrence considering all rules and dependencies
   */
  async updateNextOccurrence(scheduleId: string): Promise<Date | null> {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        rules: {
          where: { isActive: true },
        },
        dependencies: {
          include: {
            dependsOn: true,
          },
        },
      },
    });

    if (!schedule || !schedule.isActive) {
      return null;
    }

    let nextDate: Date | null = null;

    // Handle different schedule types
    switch (schedule.type) {
      case 'seasonal':
        nextDate = this.calculateSeasonalNext(schedule);
        break;
      case 'usage_based':
        // Usage-based schedules don't have a next occurrence until triggered
        return null;
      default:
        // Handle regular schedules
        nextDate = this.calculateRegularNext(schedule);
    }

    if (!nextDate) {
      return null;
    }

    // Apply rules
    nextDate = await this.applyScheduleRules(nextDate, schedule.rules);

    // Check dependencies
    nextDate = await this.checkDependencies(nextDate, schedule.dependencies);

    // Update the schedule
    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { nextOccurrence: nextDate },
    });

    return nextDate;
  }

  /**
   * Calculate next occurrence for seasonal schedules
   */
  private calculateSeasonalNext(schedule: Schedule): Date | null {
    const now = new Date();
    const months = schedule.seasonalMonths as number[] | null;

    if (!months || months.length === 0) {
      return null;
    }

    const dayOfMonth = schedule.monthlyDayOfMonth || 1;
    let nextDate: Date | null = null;

    // Check each month starting from current month
    for (let monthsAhead = 0; monthsAhead < 12; monthsAhead++) {
      const checkDate = addMonths(now, monthsAhead);
      const checkMonth = checkDate.getMonth() + 1; // JavaScript months are 0-indexed

      if (months.includes(checkMonth)) {
        const targetDate = setDate(checkDate, dayOfMonth);

        // Only consider future dates
        if (targetDate > now) {
          nextDate = targetDate;
          break;
        }
      }
    }

    return nextDate;
  }

  /**
   * Calculate next occurrence for regular schedules
   */
  private calculateRegularNext(schedule: Schedule): Date | null {
    if (schedule.customRrule) {
      try {
        const rrule = RRule.fromString(schedule.customRrule);
        const next = rrule.after(new Date());
        return next;
      } catch (error) {
        logger.error('Error parsing RRule', error as Error);
        logger.debug('RRule parse error details', { scheduleId: schedule.id });
      }
    }

    if (schedule.intervalDays) {
      const lastOccurrence = schedule.lastOccurrence || schedule.startDate;
      return addDays(lastOccurrence, schedule.intervalDays);
    }

    if (schedule.intervalMonths) {
      const lastOccurrence = schedule.lastOccurrence || schedule.startDate;
      return addMonths(lastOccurrence, schedule.intervalMonths);
    }

    return null;
  }

  /**
   * Apply schedule rules to adjust the next occurrence date
   */
  private async applyScheduleRules(date: Date, rules: ScheduleRule[]): Promise<Date> {
    let adjustedDate = date;

    for (const rule of rules) {
      switch (rule.ruleType) {
        case 'blackout_dates':
          adjustedDate = this.applyBlackoutDates(
            adjustedDate,
            rule.ruleConfig as unknown as BlackoutDatesConfig,
          );
          break;
        case 'business_days_only':
          adjustedDate = this.applyBusinessDaysOnly(
            adjustedDate,
            rule.ruleConfig as unknown as BusinessDaysConfig,
          );
          break;
      }
    }

    return adjustedDate;
  }

  /**
   * Apply blackout dates rule
   */
  private applyBlackoutDates(date: Date, config: BlackoutDatesConfig): Date {
    let adjustedDate = date;
    let attempts = 0;
    const maxAttempts = 365; // Prevent infinite loops

    while (attempts < maxAttempts) {
      const isBlackout = this.isDateBlackedOut(adjustedDate, config);

      if (!isBlackout) {
        break;
      }

      adjustedDate = addDays(adjustedDate, 1);
      attempts++;
    }

    return adjustedDate;
  }

  /**
   * Check if a date is blacked out
   */
  private isDateBlackedOut(date: Date, config: BlackoutDatesConfig): boolean {
    const dateStr = date.toISOString().split('T')[0];

    // Check specific dates
    if (config.dates && config.dates.includes(dateStr!)) {
      return true;
    }

    // Check date ranges
    if (config.ranges) {
      for (const range of config.ranges) {
        const start = new Date(range.start);
        const end = new Date(range.end);

        if (isWithinInterval(date, { start, end })) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Apply business days only rule
   */
  private applyBusinessDaysOnly(date: Date, config: BusinessDaysConfig): Date {
    let adjustedDate = date;

    // Skip weekends if configured
    if (config.excludeWeekends) {
      const dayOfWeek = adjustedDate.getDay();
      if (dayOfWeek === 0) {
        // Sunday
        adjustedDate = addDays(adjustedDate, 1);
      } else if (dayOfWeek === 6) {
        // Saturday
        adjustedDate = addDays(adjustedDate, 2);
      }
    }

    // Skip holidays if configured
    if (config.excludeHolidays && config.customHolidays) {
      const dateStr = adjustedDate.toISOString().split('T')[0];
      if (config.customHolidays.includes(dateStr!)) {
        adjustedDate = addDays(adjustedDate, 1);
        // Recursively check if the new date is also a holiday or weekend
        return this.applyBusinessDaysOnly(adjustedDate, config);
      }
    }

    return adjustedDate;
  }

  /**
   * Check schedule dependencies
   */
  private async checkDependencies(
    date: Date,
    dependencies: Array<{ dependsOn: Schedule; offsetDays: number | null }>,
  ): Promise<Date> {
    if (dependencies.length === 0) {
      return date;
    }

    let latestDate = date;

    for (const dep of dependencies) {
      const dependentSchedule = dep.dependsOn;

      // Check if the dependent schedule has completed its last task
      const lastTask = await this.prisma.task.findFirst({
        where: {
          scheduleId: dependentSchedule.id,
          status: 'DONE',
        },
        orderBy: {
          completedAt: 'desc',
        },
      });

      if (lastTask && lastTask.completedAt) {
        const dependencyDate = addDays(lastTask.completedAt, dep.offsetDays || 0);

        if (dependencyDate > latestDate) {
          latestDate = dependencyDate;
        }
      }
    }

    return latestDate;
  }

  /**
   * Get schedules that need task generation
   */
  async getSchedulesDueForGeneration(organizationId: string): Promise<Schedule[]> {
    const now = new Date();

    return await this.prisma.schedule.findMany({
      where: {
        organizationId,
        isActive: true,
        nextOccurrence: {
          lte: now,
        },
        type: {
          not: 'usage_based', // Exclude usage-based as they're triggered differently
        },
      },
      include: {
        asset: true,
        rules: {
          where: { isActive: true },
        },
      },
    });
  }
}
