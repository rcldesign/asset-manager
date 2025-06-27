import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { AdvancedScheduleService } from '../../services/advanced-schedule.service';
import { TestDatabaseHelper } from '../helpers';
import { prisma } from '../../lib/prisma';
import { addDays, format } from 'date-fns';
import type { Asset } from '@prisma/client';

describe('AdvancedScheduleService Integration Tests', () => {
  let advancedScheduleService: AdvancedScheduleService;
  let dbHelper: TestDatabaseHelper;
  let testOrg: { id: string; name: string };
  let testAsset: Asset;

  beforeAll(async () => {
    dbHelper = new TestDatabaseHelper();
    await dbHelper.connect();
    await dbHelper.clearDatabase();

    advancedScheduleService = new AdvancedScheduleService(prisma);
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();

    // Create test organization, user, and asset
    testOrg = await dbHelper.createTestOrganization();
    await dbHelper.createTestUser({ organizationId: testOrg.id });

    testAsset = await prisma.asset.create({
      data: {
        organizationId: testOrg.id,
        name: 'Test Asset',
        category: 'EQUIPMENT',
        path: '/test-asset',
      },
    });
  });

  afterAll(async () => {
    await dbHelper.disconnect();
    await prisma.$disconnect();
  });

  describe('Seasonal Schedules', () => {
    test('should create seasonal schedule for specific months', async () => {
      const config = {
        months: [3, 6, 9, 12], // March, June, September, December
        dayOfMonth: 15,
      };

      const taskTemplate = {
        title: 'Quarterly Maintenance',
        description: 'Perform quarterly maintenance check',
        priority: 'MEDIUM',
      };

      const schedule = await advancedScheduleService.createSeasonalSchedule(
        testOrg.id,
        testAsset.id,
        'Quarterly Schedule',
        config,
        taskTemplate,
      );

      expect(schedule).toBeDefined();
      expect(schedule.type).toBe('seasonal');
      expect(schedule.seasonalMonths).toEqual([3, 6, 9, 12]);
      expect(schedule.monthlyDayOfMonth).toBe(15);
      expect(schedule.nextOccurrence).toBeDefined();

      // Verify next occurrence is in one of the specified months
      if (schedule.nextOccurrence) {
        const nextMonth = schedule.nextOccurrence.getMonth() + 1;
        expect(config.months).toContain(nextMonth);
      }
    });

    test('should handle edge case of last day of month', async () => {
      const config = {
        months: [2, 4, 6], // Feb, Apr, Jun
        dayOfMonth: 31, // Should handle months without day 31
      };

      const schedule = await advancedScheduleService.createSeasonalSchedule(
        testOrg.id,
        testAsset.id,
        'Month End Schedule',
        config,
        { title: 'Month End Task' },
      );

      expect(schedule).toBeDefined();
      expect(schedule.nextOccurrence).toBeDefined();
    });

    test('should reject invalid month numbers', async () => {
      const config = {
        months: [0, 13, 15], // Invalid months
        dayOfMonth: 1,
      };

      await expect(
        advancedScheduleService.createSeasonalSchedule(
          testOrg.id,
          testAsset.id,
          'Invalid Schedule',
          config,
          { title: 'Invalid Task' },
        ),
      ).rejects.toThrow('Invalid month numbers');
    });
  });

  describe('Usage-Based Schedules', () => {
    test('should create usage-based schedule and trigger on threshold', async () => {
      const config = {
        counterType: 'operating_hours',
        threshold: 100,
        resetOnTrigger: true,
      };

      const schedule = await advancedScheduleService.createUsageBasedSchedule(
        testOrg.id,
        testAsset.id,
        'Maintenance by Hours',
        config,
        { title: 'Hours-based Maintenance' },
      );

      expect(schedule).toBeDefined();
      expect(schedule.type).toBe('usage_based');
      expect(schedule.usageThreshold).toBe(100);

      // Verify usage counter was created
      const counter = await prisma.usageCounter.findFirst({
        where: {
          assetId: testAsset.id,
          counterType: 'operating_hours',
        },
      });
      expect(counter).toBeDefined();
      expect(counter!.currentValue).toBe(0);
    });

    test('should trigger schedule when usage threshold is reached', async () => {
      const config = {
        counterType: 'cycles',
        threshold: 50,
        resetOnTrigger: true,
      };

      await advancedScheduleService.createUsageBasedSchedule(
        testOrg.id,
        testAsset.id,
        'Cycle-based Maintenance',
        config,
        { title: 'Cycle Maintenance' },
      );

      // Update counter to just below threshold
      let result = await advancedScheduleService.updateUsageCounter(testAsset.id, 'cycles', 45);
      expect(result.triggered).toBe(false);
      expect(result.counter.currentValue).toBe(45);

      // Update counter to meet threshold
      result = await advancedScheduleService.updateUsageCounter(testAsset.id, 'cycles', 10);
      expect(result.triggered).toBe(true);
      expect(result.counter.currentValue).toBe(0); // Should reset
      expect(result.schedule).toBeDefined();
    });

    test('should not reset counter when resetOnTrigger is false', async () => {
      const config = {
        counterType: 'distance',
        threshold: 1000,
        resetOnTrigger: false,
      };

      await advancedScheduleService.createUsageBasedSchedule(
        testOrg.id,
        testAsset.id,
        'Distance Maintenance',
        config,
        { title: 'Distance-based Maintenance' },
      );

      // Update to trigger
      const result = await advancedScheduleService.updateUsageCounter(
        testAsset.id,
        'distance',
        1200,
      );

      expect(result.triggered).toBe(true);
      expect(result.counter.currentValue).toBe(1200); // Should NOT reset
    });
  });

  describe('Schedule Rules and Constraints', () => {
    test('should apply blackout dates rule', async () => {
      // Create a simple schedule
      const schedule = await prisma.schedule.create({
        data: {
          organizationId: testOrg.id,
          assetId: testAsset.id,
          name: 'Test Schedule',
          scheduleType: 'FIXED_INTERVAL',
          intervalDays: 1,
          startDate: new Date(),
          taskTemplate: { title: 'Test Task' },
        },
      });

      // Add blackout dates rule
      const tomorrow = addDays(new Date(), 1);
      const dayAfter = addDays(new Date(), 2);

      const blackoutConfig = {
        dates: [format(tomorrow, 'yyyy-MM-dd'), format(dayAfter, 'yyyy-MM-dd')],
      };

      await advancedScheduleService.addScheduleRule(schedule.id, 'blackout_dates', blackoutConfig);

      // Update next occurrence should skip blackout dates
      const nextOccurrence = await advancedScheduleService.updateNextOccurrence(schedule.id);

      expect(nextOccurrence).toBeDefined();
      if (nextOccurrence) {
        const nextDateStr = format(nextOccurrence, 'yyyy-MM-dd');
        expect(blackoutConfig.dates).not.toContain(nextDateStr);
      }
    });

    test('should apply business days only rule', async () => {
      const schedule = await prisma.schedule.create({
        data: {
          organizationId: testOrg.id,
          assetId: testAsset.id,
          name: 'Business Days Schedule',
          scheduleType: 'FIXED_INTERVAL',
          intervalDays: 1,
          startDate: new Date(),
          taskTemplate: { title: 'Business Task' },
        },
      });

      const businessDaysConfig = {
        excludeWeekends: true,
        excludeHolidays: false,
      };

      await advancedScheduleService.addScheduleRule(
        schedule.id,
        'business_days_only',
        businessDaysConfig,
      );

      // Update next occurrence
      const nextOccurrence = await advancedScheduleService.updateNextOccurrence(schedule.id);

      expect(nextOccurrence).toBeDefined();
      if (nextOccurrence) {
        const dayOfWeek = nextOccurrence.getDay();
        expect(dayOfWeek).not.toBe(0); // Not Sunday
        expect(dayOfWeek).not.toBe(6); // Not Saturday
      }
    });

    test('should handle schedule dependencies', async () => {
      // Create prerequisite schedule
      const prerequisiteSchedule = await prisma.schedule.create({
        data: {
          organizationId: testOrg.id,
          assetId: testAsset.id,
          name: 'Prerequisite Schedule',
          scheduleType: 'FIXED_INTERVAL',
          intervalDays: 7,
          startDate: new Date(),
          taskTemplate: { title: 'Prerequisite Task' },
        },
      });

      // Create dependent schedule
      const dependentSchedule = await prisma.schedule.create({
        data: {
          organizationId: testOrg.id,
          assetId: testAsset.id,
          name: 'Dependent Schedule',
          scheduleType: 'FIXED_INTERVAL',
          intervalDays: 7,
          startDate: new Date(),
          taskTemplate: { title: 'Dependent Task' },
        },
      });

      // Add dependency rule
      const dependencyConfig = {
        dependsOnScheduleId: prerequisiteSchedule.id,
        offsetDays: 2,
      };

      await advancedScheduleService.addScheduleRule(
        dependentSchedule.id,
        'dependency',
        dependencyConfig,
      );

      // Create and complete a task for the prerequisite schedule
      const prerequisiteTask = await prisma.task.create({
        data: {
          organizationId: testOrg.id,
          assetId: testAsset.id,
          scheduleId: prerequisiteSchedule.id,
          title: 'Prerequisite Task',
          dueDate: new Date(),
          status: 'DONE',
          completedAt: new Date(),
        },
      });

      // Update dependent schedule - should respect the dependency
      const nextOccurrence = await advancedScheduleService.updateNextOccurrence(
        dependentSchedule.id,
      );

      expect(nextOccurrence).toBeDefined();
      if (nextOccurrence && prerequisiteTask.completedAt) {
        const expectedMinDate = addDays(prerequisiteTask.completedAt, 2);
        expect(nextOccurrence.getTime()).toBeGreaterThanOrEqual(expectedMinDate.getTime());
      }
    });
  });

  describe('Task Generation', () => {
    test('should find schedules due for generation', async () => {
      // Create a schedule that's due now
      const pastDate = addDays(new Date(), -1);

      const schedule = await prisma.schedule.create({
        data: {
          organizationId: testOrg.id,
          assetId: testAsset.id,
          name: 'Due Schedule',
          scheduleType: 'FIXED_INTERVAL',
          intervalDays: 1,
          startDate: pastDate,
          nextOccurrence: pastDate,
          isActive: true,
          taskTemplate: { title: 'Due Task' },
        },
      });

      const dueSchedules = await advancedScheduleService.getSchedulesDueForGeneration(testOrg.id);

      expect(dueSchedules).toBeDefined();
      expect(dueSchedules.length).toBeGreaterThan(0);
      expect(dueSchedules.find((s) => s.id === schedule.id)).toBeDefined();
    });

    test('should exclude usage-based schedules from due generation', async () => {
      // Create a usage-based schedule
      const config = {
        counterType: 'test_counter',
        threshold: 100,
      };

      await advancedScheduleService.createUsageBasedSchedule(
        testOrg.id,
        testAsset.id,
        'Usage Schedule',
        config,
        { title: 'Usage Task' },
      );

      const dueSchedules = await advancedScheduleService.getSchedulesDueForGeneration(testOrg.id);

      // Should not include any usage-based schedules
      const usageBasedSchedules = dueSchedules.filter((s) => s.type === 'usage_based');
      expect(usageBasedSchedules).toHaveLength(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle invalid schedule types gracefully', async () => {
      // Create schedule with unknown type
      const schedule = await prisma.schedule.create({
        data: {
          organizationId: testOrg.id,
          assetId: testAsset.id,
          name: 'Invalid Type Schedule',
          scheduleType: 'FIXED_INTERVAL',
          type: 'unknown_type',
          startDate: new Date(),
          taskTemplate: { title: 'Test Task' },
        },
      });

      // Should not throw, but should return null for next occurrence
      const nextOccurrence = await advancedScheduleService.updateNextOccurrence(schedule.id);
      expect(nextOccurrence).toBeNull();
    });

    test('should handle missing usage counter gracefully', async () => {
      await expect(
        advancedScheduleService.updateUsageCounter(testAsset.id, 'nonexistent_counter', 10),
      ).rejects.toThrow('Usage counter not found');
    });

    test('should prevent infinite loops in rule application', async () => {
      // Create schedule
      const schedule = await prisma.schedule.create({
        data: {
          organizationId: testOrg.id,
          assetId: testAsset.id,
          name: 'Problematic Schedule',
          scheduleType: 'FIXED_INTERVAL',
          intervalDays: 1,
          startDate: new Date(),
          taskTemplate: { title: 'Test Task' },
        },
      });

      // Add rule that blacks out an entire year (edge case)
      const blackoutDates = [];
      for (let i = 0; i < 365; i++) {
        blackoutDates.push(format(addDays(new Date(), i), 'yyyy-MM-dd'));
      }

      await advancedScheduleService.addScheduleRule(schedule.id, 'blackout_dates', {
        dates: blackoutDates,
      });

      // Should handle gracefully and not hang
      const nextOccurrence = await advancedScheduleService.updateNextOccurrence(schedule.id);

      // Should find a date eventually or handle the edge case properly
      // The exact behavior depends on implementation, but it shouldn't hang
      expect(typeof nextOccurrence).toBe('object'); // null or Date
    });
  });
});
