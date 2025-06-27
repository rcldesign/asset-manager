import { test, expect } from '@playwright/test';
import { ApiHelpers } from '../../support/helpers/api-helpers';
import { createTimeTravel, TestDates } from '../../support/helpers/time-travel';
import { SchedulePage } from '../../support/page-objects/schedule.page';

test.describe('Advanced Scheduling @scheduling @critical', () => {
  let apiHelpers: ApiHelpers;
  let timeTravel: any;
  let schedulePage: SchedulePage;
  let testUser: any;
  let testOrg: any;
  let testAsset: any;

  test.beforeEach(async ({ page, request }) => {
    // Initialize helpers
    apiHelpers = new ApiHelpers(request);
    timeTravel = createTimeTravel(request);
    schedulePage = new SchedulePage(page);

    // Reset time to ensure clean state
    await timeTravel.reset();

    // Create test organization
    testOrg = await apiHelpers.createOrganization({
      name: 'Test Org for Scheduling'
    });

    // Create test user with manager role
    testUser = await apiHelpers.createUser({
      email: 'scheduler@test.com',
      fullName: 'Schedule Manager',
      role: 'MANAGER',
      organizationId: testOrg.id
    });

    // Create test asset
    testAsset = await apiHelpers.createAsset({
      name: 'HVAC System',
      description: 'Main building HVAC for testing',
      organizationId: testOrg.id
    });

    // Login as test user
    await schedulePage.loginWithToken(testUser.token);
  });

  test.afterEach(async ({ request }) => {
    // Reset time and clean up data
    await timeTravel.reset();
    await apiHelpers.cleanup();
  });

  test('should create seasonal schedule and generate tasks in correct season @seasonal', async ({ page }) => {
    // Install Playwright's clock for frontend time control
    await page.clock.install({ time: new Date(TestDates.SPRING_START) });

    // Navigate to schedules page
    await schedulePage.goto();

    // Create a summer seasonal schedule
    await schedulePage.createSeasonalSchedule({
      name: 'Summer HVAC Maintenance',
      description: 'Quarterly maintenance for summer season',
      seasons: ['summer'],
      taskTemplate: 'HVAC Maintenance',
      businessDaysOnly: true
    });

    // Verify schedule was created
    await schedulePage.verifyScheduleExists('Summer HVAC Maintenance');

    // Set backend time to just before summer starts
    await timeTravel.setTo(TestDates.SPRING_START);

    // Run scheduler - should not generate tasks yet
    await apiHelpers.runScheduler();
    
    // Navigate to tasks page to verify no tasks exist
    await page.goto('/tasks');
    await expect(page.getByText('Summer HVAC Maintenance')).not.toBeVisible();

    // Travel backend time into summer season
    await timeTravel.setTo(TestDates.SUMMER_START);

    // Run scheduler again - should now generate tasks
    await apiHelpers.runScheduler();

    // Refresh page and verify task was created
    await page.reload();
    await page.waitForTimeout(1000); // Wait for any async updates
    await expect(page.getByText('Summer HVAC Maintenance')).toBeVisible({ timeout: 10000 });

    // Verify it's a business day task (should have business day indicator)
    const taskRow = page.locator(`tr:has-text("Summer HVAC Maintenance")`);
    await expect(taskRow.getByTestId('business-days-only')).toBeVisible();
  });

  test('should create usage-based schedule and trigger on counter threshold @usage-based', async ({ page }) => {
    await page.clock.install({ time: new Date() });

    // Navigate to schedules page
    await schedulePage.goto();

    // Create usage-based schedule
    await schedulePage.createUsageBasedSchedule({
      name: 'HVAC Filter Change',
      description: 'Change filter every 100 operating hours',
      counterType: 'HOURS',
      threshold: 100,
      taskTemplate: 'Filter Replacement'
    });

    // Verify schedule was created
    await schedulePage.verifyScheduleExists('HVAC Filter Change');

    // Update asset usage counter to 50 hours (below threshold)
    await apiHelpers.updateUsageCounter(testAsset.id, 'HOURS', 50);

    // Run scheduler - should not generate tasks yet
    await apiHelpers.runScheduler();

    // Verify no tasks created
    await page.goto('/tasks');
    await expect(page.getByText('HVAC Filter Change')).not.toBeVisible();

    // Update usage counter to 150 hours (above threshold)
    await apiHelpers.updateUsageCounter(testAsset.id, 'HOURS', 150);

    // Run scheduler - should now generate task
    await apiHelpers.runScheduler();

    // Refresh and verify task was created
    await page.reload();
    await expect(page.getByText('HVAC Filter Change')).toBeVisible({ timeout: 10000 });
  });

  test('should respect blackout dates in seasonal schedule @blackout-dates', async ({ page }) => {
    await page.clock.install({ time: new Date(TestDates.SUMMER_START) });

    // Set backend time to summer
    await timeTravel.setTo(TestDates.SUMMER_START);

    await schedulePage.goto();

    // Create seasonal schedule with blackout dates
    const blackoutDate = '2024-07-04'; // Independence Day
    await schedulePage.createSeasonalSchedule({
      name: 'Summer Maintenance with Blackouts',
      seasons: ['summer'],
      taskTemplate: 'Maintenance Task',
      blackoutDates: [blackoutDate]
    });

    // Set backend time to blackout date
    await timeTravel.setTo('2024-07-04T10:00:00Z');

    // Run scheduler on blackout date
    await apiHelpers.runScheduler();

    // Verify no task created due to blackout
    await page.goto('/tasks');
    await expect(page.getByText('Summer Maintenance with Blackouts')).not.toBeVisible();

    // Move to day after blackout
    await timeTravel.setTo('2024-07-05T10:00:00Z');

    // Run scheduler again
    await apiHelpers.runScheduler();

    // Verify task is now created
    await page.reload();
    await expect(page.getByText('Summer Maintenance with Blackouts')).toBeVisible({ timeout: 10000 });
  });

  test('should handle schedule dependencies correctly @dependencies', async ({ page }) => {
    await page.clock.install({ time: new Date(TestDates.SUMMER_START) });

    // Create two assets
    const secondAsset = await apiHelpers.createAsset({
      name: 'Backup HVAC System',
      description: 'Backup system that depends on main system',
      organizationId: testOrg.id
    });

    await schedulePage.goto();

    // Create primary schedule
    await schedulePage.createSeasonalSchedule({
      name: 'Primary HVAC Maintenance',
      seasons: ['summer'],
      taskTemplate: 'Primary Maintenance'
    });

    // Navigate to the second asset and create dependent schedule
    await page.goto(`/assets/${secondAsset.id}`);
    await page.getByRole('tab', { name: 'Schedules' }).click();
    await page.getByRole('button', { name: /add schedule/i }).click();

    // Create dependent schedule
    await schedulePage.seasonalTab.click();
    await schedulePage.nameField.fill('Dependent HVAC Maintenance');
    await schedulePage.taskTemplateSelect.click();
    await page.getByRole('option', { name: 'Dependent Maintenance' }).click();
    await schedulePage.summerCheckbox.check();

    // Add dependency
    await schedulePage.addDependencyButton.click();
    await schedulePage.dependencySelect.click();
    await page.getByRole('option', { name: 'Primary HVAC Maintenance' }).click();

    await schedulePage.saveButton.click();
    await schedulePage.expectSuccess();

    // Set time and run scheduler
    await timeTravel.setTo(TestDates.SUMMER_START);
    await apiHelpers.runScheduler();

    // Verify only primary task is created initially
    await page.goto('/tasks');
    await expect(page.getByText('Primary HVAC Maintenance')).toBeVisible();
    await expect(page.getByText('Dependent HVAC Maintenance')).not.toBeVisible();

    // Complete the primary task
    const primaryTaskRow = page.locator(`tr:has-text("Primary HVAC Maintenance")`);
    await primaryTaskRow.getByRole('button', { name: /complete/i }).click();
    await schedulePage.confirmAction();

    // Run scheduler again
    await apiHelpers.runScheduler();

    // Verify dependent task is now created
    await page.reload();
    await expect(page.getByText('Dependent HVAC Maintenance')).toBeVisible({ timeout: 10000 });
  });

  test('should verify task generation over a full year for seasonal schedule @long-term', async ({ page }) => {
    await page.clock.install({ time: new Date(TestDates.SPRING_START) });

    await schedulePage.goto();

    // Create a schedule that runs in all seasons
    await schedulePage.createSeasonalSchedule({
      name: 'Quarterly Inspection',
      seasons: ['spring', 'summer', 'fall', 'winter'],
      taskTemplate: 'Quarterly Check'
    });

    const taskCounts: Record<string, number> = {};

    // Test each season
    const seasons = [
      { name: 'Spring', date: TestDates.SPRING_START },
      { name: 'Summer', date: TestDates.SUMMER_START },
      { name: 'Fall', date: TestDates.FALL_START },
      { name: 'Winter', date: TestDates.WINTER_START }
    ];

    for (const season of seasons) {
      // Set backend time to season start
      await timeTravel.setTo(season.date);

      // Run scheduler
      await apiHelpers.runScheduler();

      // Check tasks page
      await page.goto('/tasks');
      
      // Count tasks for this season
      const taskElements = await page.getByText('Quarterly Inspection').all();
      taskCounts[season.name] = taskElements.length;

      // Verify at least one task exists for this season
      expect(taskCounts[season.name]).toBeGreaterThan(0);
    }

    // Verify we have tasks generated for all seasons
    expect(Object.keys(taskCounts)).toHaveLength(4);
    
    // Log the results for debugging
    console.log('Task counts by season:', taskCounts);
  });

  test('should handle monthly schedule on specific day @monthly', async ({ page }) => {
    await page.clock.install({ time: new Date(TestDates.MONTH_START) });

    await schedulePage.goto();

    // Create monthly schedule for the 15th of each month
    await schedulePage.createMonthlySchedule({
      name: 'Monthly Safety Check',
      description: 'Monthly safety inspection',
      dayOfMonth: 15,
      taskTemplate: 'Safety Inspection'
    });

    // Set backend time to before the 15th
    await timeTravel.setTo('2024-06-10T10:00:00Z');
    await apiHelpers.runScheduler();

    // Verify no task created yet
    await page.goto('/tasks');
    await expect(page.getByText('Monthly Safety Check')).not.toBeVisible();

    // Set backend time to the 15th
    await timeTravel.setTo(TestDates.MONTH_MIDDLE); // June 15th
    await apiHelpers.runScheduler();

    // Verify task is created
    await page.reload();
    await expect(page.getByText('Monthly Safety Check')).toBeVisible({ timeout: 10000 });

    // Advance to next month's 15th
    await timeTravel.setTo('2024-07-15T10:00:00Z');
    await apiHelpers.runScheduler();

    // Verify another task is created for the new month
    await page.reload();
    const taskElements = await page.getByText('Monthly Safety Check').all();
    expect(taskElements.length).toBeGreaterThanOrEqual(2);
  });
});