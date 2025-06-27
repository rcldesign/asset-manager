import { test, expect } from '@playwright/test';
import { ApiHelpers } from '../../support/helpers/api-helpers';
import { createTimeTravel, TestDates } from '../../support/helpers/time-travel';
import { CalendarPage } from '../../support/page-objects/calendar.page';
import { TaskPage } from '../../support/page-objects/task.page';

test.describe('Calendar Integration @calendar @integration', () => {
  let apiHelpers: ApiHelpers;
  let timeTravel: any;
  let calendarPage: CalendarPage;
  let taskPage: TaskPage;
  let testUser: any;
  let testOrg: any;
  let testAsset: any;

  test.beforeEach(async ({ page, request }) => {
    // Initialize helpers
    apiHelpers = new ApiHelpers(request);
    timeTravel = createTimeTravel(request);
    calendarPage = new CalendarPage(page);
    taskPage = new TaskPage(page);

    // Reset time
    await timeTravel.reset();

    // Create test organization
    testOrg = await apiHelpers.createOrganization({
      name: 'Test Org for Calendar Integration'
    });

    // Create test user
    testUser = await apiHelpers.createUser({
      email: 'calendar@test.com',
      fullName: 'Calendar User',
      role: 'MANAGER',
      organizationId: testOrg.id
    });

    // Create test asset
    testAsset = await apiHelpers.createAsset({
      name: 'Calendar Test Equipment',
      description: 'Equipment for calendar testing',
      organizationId: testOrg.id
    });

    // Login as test user
    await calendarPage.loginWithToken(testUser.token);
  });

  test.afterEach(async ({ request }) => {
    await timeTravel.reset();
    await apiHelpers.cleanup();
  });

  test('should connect Google Calendar and sync tasks @google-calendar-sync', async ({ page }) => {
    // Navigate to calendar integration settings
    await calendarPage.goto();
    await calendarPage.openIntegrationSettings();

    // Mock Google OAuth flow (in real test this would use OAuth)
    await calendarPage.connectGoogleCalendar();

    // Verify connection status
    await expect(page.getByText('Google Calendar connected')).toBeVisible();
    await expect(page.getByTestId('google-calendar-status')).toContainText('Connected');

    // Create a task with due date
    const task = await apiHelpers.createTask({
      title: 'Calendar Sync Test Task',
      description: 'Task to verify calendar synchronization',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    // Set task due date via UI
    await taskPage.goto();
    await taskPage.openTask(task.title);
    await taskPage.setDueDate('2024-07-15T14:00:00');
    await taskPage.saveButton.click();

    // Navigate back to calendar
    await calendarPage.goto();

    // Verify task appears in calendar view
    await calendarPage.navigateToDate('2024-07-15');
    await expect(page.getByText('Calendar Sync Test Task')).toBeVisible();

    // Verify task has calendar event indicator
    const taskEvent = page.locator('[data-testid="calendar-event"]:has-text("Calendar Sync Test Task")');
    await expect(taskEvent.getByTestId('google-calendar-sync')).toBeVisible();
  });

  test('should generate iCalendar feed for user tasks @ical-feed', async ({ page }) => {
    // Create several tasks with different due dates
    const tasks = [];
    const dueDates = ['2024-07-10T09:00:00', '2024-07-15T14:00:00', '2024-07-20T16:00:00'];
    
    for (let i = 0; i < 3; i++) {
      const task = await apiHelpers.createTask({
        title: `iCal Test Task ${i + 1}`,
        assetId: testAsset.id,
        assignedToId: testUser.id,
        organizationId: testOrg.id
      });
      
      // Set due dates via API
      await apiHelpers.request.patch(`${apiHelpers['baseUrl']}/api/tasks/${task.id}`, {
        data: { dueDate: dueDates[i] }
      });
      
      tasks.push(task);
    }

    // Navigate to calendar settings
    await calendarPage.goto();
    await calendarPage.openIntegrationSettings();

    // Generate iCalendar feed
    await calendarPage.generateICalFeed();

    // Verify iCal feed URL is provided
    const feedUrl = await page.getByTestId('ical-feed-url').textContent();
    expect(feedUrl).toContain('/api/calendar/ical/');
    expect(feedUrl).toContain(testUser.id);

    // Test the iCal feed directly
    const response = await page.request.get(feedUrl);
    expect(response.ok()).toBeTruthy();
    
    const icalContent = await response.text();
    
    // Verify iCal format and content
    expect(icalContent).toContain('BEGIN:VCALENDAR');
    expect(icalContent).toContain('END:VCALENDAR');
    
    // Verify all tasks are included
    for (const task of tasks) {
      expect(icalContent).toContain(task.title);
    }
    
    // Verify VEVENT blocks
    const eventCount = (icalContent.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(tasks.length);
  });

  test('should sync task completion status to Google Calendar @completion-sync', async ({ page }) => {
    // Connect Google Calendar
    await calendarPage.goto();
    await calendarPage.openIntegrationSettings();
    await calendarPage.connectGoogleCalendar();

    // Create and sync a task
    const task = await apiHelpers.createTask({
      title: 'Completion Sync Test',
      assetId: testAsset.id,
      assignedToId: testUser.id,
      organizationId: testOrg.id
    });

    // Set due date and sync
    await taskPage.goto();
    await taskPage.openTask(task.title);
    await taskPage.setDueDate('2024-07-15T10:00:00');
    await taskPage.saveButton.click();

    // Verify task synced to calendar
    await calendarPage.goto();
    await calendarPage.navigateToDate('2024-07-15');
    const calendarEvent = page.locator('[data-testid="calendar-event"]:has-text("Completion Sync Test")');
    await expect(calendarEvent).toBeVisible();

    // Complete the task
    await taskPage.goto();
    await taskPage.openTask(task.title);
    await taskPage.completeTask('Task finished successfully');

    // Return to calendar and verify completion status
    await calendarPage.goto();
    await calendarPage.navigateToDate('2024-07-15');
    
    // Verify event shows as completed
    await expect(calendarEvent.getByTestId('completion-indicator')).toBeVisible();
    await expect(calendarEvent).toHaveClass(/completed/);
  });

  test('should handle calendar event conflicts and reschedule @conflict-resolution', async ({ page }) => {
    // Connect calendar
    await calendarPage.goto();
    await calendarPage.openIntegrationSettings();
    await calendarPage.connectGoogleCalendar();

    // Create two tasks with overlapping times
    const task1 = await apiHelpers.createTask({
      title: 'First Scheduled Task',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    const task2 = await apiHelpers.createTask({
      title: 'Conflicting Task',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    // Schedule both tasks for the same time
    const conflictTime = '2024-07-15T14:00:00';
    
    await taskPage.goto();
    await taskPage.openTask(task1.title);
    await taskPage.setDueDate(conflictTime);
    await taskPage.saveButton.click();

    await taskPage.openTask(task2.title);
    await taskPage.setDueDate(conflictTime);
    
    // Expect conflict warning
    await expect(page.getByTestId('schedule-conflict-warning')).toBeVisible();
    await expect(page.getByText('Time conflict detected')).toBeVisible();

    // Choose to reschedule
    await page.getByRole('button', { name: /suggest new time/i }).click();
    
    // Accept suggested time
    await expect(page.getByTestId('suggested-time')).toBeVisible();
    await page.getByRole('button', { name: /accept suggestion/i }).click();
    
    await taskPage.saveButton.click();
    await taskPage.expectSuccess();

    // Verify both tasks are scheduled without conflict
    await calendarPage.goto();
    await calendarPage.navigateToDate('2024-07-15');
    
    await expect(page.getByText('First Scheduled Task')).toBeVisible();
    await expect(page.getByText('Conflicting Task')).toBeVisible();
    
    // Verify they have different times
    const firstTaskTime = await page.locator('[data-testid="calendar-event"]:has-text("First Scheduled Task")').getAttribute('data-time');
    const secondTaskTime = await page.locator('[data-testid="calendar-event"]:has-text("Conflicting Task")').getAttribute('data-time');
    
    expect(firstTaskTime).not.toBe(secondTaskTime);
  });

  test('should support bulk calendar operations @bulk-calendar-ops', async ({ page }) => {
    // Create multiple tasks
    const tasks = [];
    for (let i = 1; i <= 5; i++) {
      const task = await apiHelpers.createTask({
        title: `Bulk Calendar Task ${i}`,
        assetId: testAsset.id,
        organizationId: testOrg.id
      });
      tasks.push(task);
    }

    await calendarPage.goto();

    // Switch to calendar view
    await calendarPage.switchToWeekView();
    await calendarPage.navigateToDate('2024-07-15');

    // Drag and drop multiple tasks to calendar
    await taskPage.goto();
    
    // Select multiple tasks
    for (const task of tasks.slice(0, 3)) {
      await taskPage.selectTask(task.title);
    }

    // Bulk schedule for the same day
    await taskPage.bulkSchedule('2024-07-15');

    // Verify scheduling dialog
    await expect(page.getByTestId('bulk-schedule-dialog')).toBeVisible();
    
    // Set time distribution (e.g., every 2 hours starting at 9 AM)
    await page.getByLabel(/start time/i).fill('09:00');
    await page.getByLabel(/interval/i).fill('2 hours');
    
    await page.getByRole('button', { name: /schedule all/i }).click();
    await taskPage.expectSuccess();

    // Verify all tasks appear in calendar
    await calendarPage.goto();
    await calendarPage.navigateToDate('2024-07-15');
    
    const expectedTimes = ['09:00', '11:00', '13:00'];
    for (let i = 0; i < 3; i++) {
      const task = tasks[i];
      const taskEvent = page.locator(`[data-testid="calendar-event"]:has-text("${task.title}")`);
      await expect(taskEvent).toBeVisible();
      
      const eventTime = await taskEvent.getAttribute('data-time');
      expect(eventTime).toContain(expectedTimes[i]);
    }
  });

  test('should export calendar data in multiple formats @calendar-export', async ({ page }) => {
    // Create tasks with various data
    const task1 = await apiHelpers.createTask({
      title: 'Export Test Task 1',
      description: 'First task for export testing',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    const task2 = await apiHelpers.createTask({
      title: 'Export Test Task 2',
      description: 'Second task for export testing',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    // Schedule tasks
    await taskPage.goto();
    await taskPage.openTask(task1.title);
    await taskPage.setDueDate('2024-07-15T10:00:00');
    await taskPage.saveButton.click();

    await taskPage.openTask(task2.title);
    await taskPage.setDueDate('2024-07-16T14:00:00');
    await taskPage.saveButton.click();

    await calendarPage.goto();
    
    // Test iCalendar export
    await calendarPage.exportCalendar('ical');
    
    // Verify download initiated
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download ical/i }).click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('.ics');

    // Test CSV export
    await calendarPage.exportCalendar('csv');
    
    const csvDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download csv/i }).click();
    const csvDownload = await csvDownloadPromise;
    
    expect(csvDownload.suggestedFilename()).toContain('.csv');

    // Test JSON export
    await calendarPage.exportCalendar('json');
    
    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download json/i }).click();
    const jsonDownload = await jsonDownloadPromise;
    
    expect(jsonDownload.suggestedFilename()).toContain('.json');
  });

  test('should handle timezone conversions correctly @timezone-handling', async ({ page }) => {
    // Set user timezone
    await calendarPage.goto();
    await calendarPage.openSettings();
    await calendarPage.setTimezone('America/Los_Angeles'); // PST/PDT

    // Create task with UTC time
    const task = await apiHelpers.createTask({
      title: 'Timezone Test Task',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    // Schedule for 20:00 UTC (should show as 13:00 or 12:00 Pacific)
    await taskPage.goto();
    await taskPage.openTask(task.title);
    await taskPage.setDueDate('2024-07-15T20:00:00Z'); // Explicit UTC
    await taskPage.saveButton.click();

    // Verify timezone conversion in calendar
    await calendarPage.goto();
    await calendarPage.navigateToDate('2024-07-15');
    
    const taskEvent = page.locator('[data-testid="calendar-event"]:has-text("Timezone Test Task")');
    await expect(taskEvent).toBeVisible();
    
    // Verify displayed time is converted to user timezone
    const displayedTime = await taskEvent.getByTestId('event-time').textContent();
    expect(displayedTime).toMatch(/1[23]:00/); // Either 12:00 or 13:00 depending on DST

    // Generate iCal and verify timezone handling
    await calendarPage.openIntegrationSettings();
    await calendarPage.generateICalFeed();
    
    const feedUrl = await page.getByTestId('ical-feed-url').textContent();
    const response = await page.request.get(feedUrl);
    const icalContent = await response.text();
    
    // Verify timezone information in iCal
    expect(icalContent).toContain('DTSTART:20240715T200000Z');
    expect(icalContent).toContain('BEGIN:VTIMEZONE');
  });
});