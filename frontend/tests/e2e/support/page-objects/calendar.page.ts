import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object for Calendar Integration
 */
export class CalendarPage extends BasePage {
  // Navigation and views
  readonly calendarView: Locator;
  readonly monthViewButton: Locator;
  readonly weekViewButton: Locator;
  readonly dayViewButton: Locator;
  readonly listViewButton: Locator;
  
  // Calendar navigation
  readonly previousButton: Locator;
  readonly nextButton: Locator;
  readonly todayButton: Locator;
  readonly dateNavigator: Locator;
  readonly currentDateDisplay: Locator;
  
  // Calendar events
  readonly calendarEvents: Locator;
  readonly eventDetails: Locator;
  readonly eventTime: Locator;
  
  // Integration settings
  readonly integrationSettingsButton: Locator;
  readonly googleCalendarConnect: Locator;
  readonly googleCalendarStatus: Locator;
  readonly icalFeedButton: Locator;
  readonly icalFeedUrl: Locator;
  
  // Export options
  readonly exportButton: Locator;
  readonly exportFormatSelect: Locator;
  readonly downloadButton: Locator;
  
  // Settings
  readonly calendarSettings: Locator;
  readonly timezoneSelect: Locator;
  readonly viewPreferencesButton: Locator;
  
  // Task scheduling
  readonly scheduleTaskButton: Locator;
  readonly bulkScheduleDialog: Locator;
  readonly startTimeField: Locator;
  readonly intervalField: Locator;

  constructor(page: Page) {
    super(page);
    
    // Main view elements
    this.calendarView = page.locator('[data-testid="calendar-view"]');
    this.monthViewButton = page.getByRole('button', { name: /month/i });
    this.weekViewButton = page.getByRole('button', { name: /week/i });
    this.dayViewButton = page.getByRole('button', { name: /day/i });
    this.listViewButton = page.getByRole('button', { name: /list/i });
    
    // Navigation
    this.previousButton = page.getByRole('button', { name: /previous|prev/i });
    this.nextButton = page.getByRole('button', { name: /next/i });
    this.todayButton = page.getByRole('button', { name: /today/i });
    this.dateNavigator = page.locator('[data-testid="date-navigator"]');
    this.currentDateDisplay = page.locator('[data-testid="current-date"]');
    
    // Events
    this.calendarEvents = page.locator('[data-testid="calendar-event"]');
    this.eventDetails = page.locator('[data-testid="event-details"]');
    this.eventTime = page.locator('[data-testid="event-time"]');
    
    // Integration
    this.integrationSettingsButton = page.getByRole('button', { name: /integration settings|calendar settings/i });
    this.googleCalendarConnect = page.getByRole('button', { name: /connect google calendar/i });
    this.googleCalendarStatus = page.locator('[data-testid="google-calendar-status"]');
    this.icalFeedButton = page.getByRole('button', { name: /generate.*ical|ical.*feed/i });
    this.icalFeedUrl = page.locator('[data-testid="ical-feed-url"]');
    
    // Export
    this.exportButton = page.getByRole('button', { name: /export/i });
    this.exportFormatSelect = page.getByLabel(/export format/i);
    this.downloadButton = page.getByRole('button', { name: /download/i });
    
    // Settings
    this.calendarSettings = page.locator('[data-testid="calendar-settings"]');
    this.timezoneSelect = page.getByLabel(/timezone/i);
    this.viewPreferencesButton = page.getByRole('button', { name: /view preferences/i });
    
    // Task scheduling
    this.scheduleTaskButton = page.getByRole('button', { name: /schedule task/i });
    this.bulkScheduleDialog = page.locator('[data-testid="bulk-schedule-dialog"]');
    this.startTimeField = page.getByLabel(/start time/i);
    this.intervalField = page.getByLabel(/interval/i);
  }

  /**
   * Navigate to calendar page
   */
  async goto() {
    await super.goto('/calendar');
  }

  /**
   * Switch to month view
   */
  async switchToMonthView() {
    await this.monthViewButton.click();
    await expect(this.calendarView).toHaveAttribute('data-view', 'month');
  }

  /**
   * Switch to week view
   */
  async switchToWeekView() {
    await this.weekViewButton.click();
    await expect(this.calendarView).toHaveAttribute('data-view', 'week');
  }

  /**
   * Switch to day view
   */
  async switchToDayView() {
    await this.dayViewButton.click();
    await expect(this.calendarView).toHaveAttribute('data-view', 'day');
  }

  /**
   * Navigate to specific date
   */
  async navigateToDate(dateString: string) {
    // Parse date and navigate accordingly
    const targetDate = new Date(dateString);
    const currentDateText = await this.currentDateDisplay.textContent();
    
    // Simple navigation - in real implementation would be more sophisticated
    await this.dateNavigator.click();
    await this.page.getByLabel(/go to date/i).fill(dateString);
    await this.page.getByRole('button', { name: /go/i }).click();
    
    // Wait for calendar to update
    await this.page.waitForTimeout(500);
  }

  /**
   * Navigate to today
   */
  async navigateToToday() {
    await this.todayButton.click();
  }

  /**
   * Navigate to previous period
   */
  async navigatePrevious() {
    await this.previousButton.click();
  }

  /**
   * Navigate to next period
   */
  async navigateNext() {
    await this.nextButton.click();
  }

  /**
   * Open integration settings
   */
  async openIntegrationSettings() {
    await this.integrationSettingsButton.click();
    await expect(this.page.locator('[data-testid="integration-settings-dialog"]')).toBeVisible();
  }

  /**
   * Connect Google Calendar (mocked for testing)
   */
  async connectGoogleCalendar() {
    await this.googleCalendarConnect.click();
    
    // In real test, this would handle OAuth flow
    // For testing, we mock the connection
    await this.page.locator('[data-testid="mock-google-auth"]').click();
    await this.page.getByRole('button', { name: /authorize/i }).click();
    
    await this.expectSuccess('Google Calendar connected');
  }

  /**
   * Generate iCalendar feed
   */
  async generateICalFeed() {
    await this.icalFeedButton.click();
    await expect(this.icalFeedUrl).toBeVisible();
  }

  /**
   * Revoke calendar integration
   */
  async revokeCalendarIntegration() {
    await this.page.getByRole('button', { name: /revoke|disconnect/i }).click();
    await this.confirmAction();
    await this.expectSuccess();
  }

  /**
   * Export calendar in specified format
   */
  async exportCalendar(format: 'ical' | 'csv' | 'json') {
    await this.exportButton.click();
    await this.exportFormatSelect.click();
    await this.page.getByRole('option', { name: format.toUpperCase() }).click();
  }

  /**
   * Open calendar settings
   */
  async openSettings() {
    await this.page.getByRole('button', { name: /calendar settings/i }).click();
    await expect(this.calendarSettings).toBeVisible();
  }

  /**
   * Set timezone
   */
  async setTimezone(timezone: string) {
    await this.timezoneSelect.click();
    await this.page.getByRole('option', { name: timezone }).click();
    await this.saveButton.click();
    await this.expectSuccess();
  }

  /**
   * Create calendar event from task
   */
  async createEventFromTask(taskTitle: string, dateTime: string) {
    // Find task in sidebar or list
    const taskItem = this.page.locator(`[data-testid="task-item"]:has-text("${taskTitle}")`);
    
    // Drag task to calendar (simplified for testing)
    await taskItem.click();
    await this.scheduleTaskButton.click();
    
    // Set date and time
    await this.page.getByLabel(/date/i).fill(dateTime.split('T')[0]);
    await this.page.getByLabel(/time/i).fill(dateTime.split('T')[1]);
    
    await this.saveButton.click();
    await this.expectSuccess();
  }

  /**
   * Get event details
   */
  async getEventDetails(eventTitle: string) {
    const event = this.calendarEvents.locator(`:has-text("${eventTitle}")`);
    await event.click();
    
    await expect(this.eventDetails).toBeVisible();
    
    const time = await this.eventDetails.locator('[data-testid="event-time"]').textContent();
    const description = await this.eventDetails.locator('[data-testid="event-description"]').textContent();
    
    return { time, description };
  }

  /**
   * Edit calendar event
   */
  async editEvent(eventTitle: string, newDetails: { time?: string; description?: string }) {
    const event = this.calendarEvents.locator(`:has-text("${eventTitle}")`);
    await event.click();
    
    await this.page.getByRole('button', { name: /edit/i }).click();
    
    if (newDetails.time) {
      await this.page.getByLabel(/time/i).fill(newDetails.time);
    }
    
    if (newDetails.description) {
      await this.page.getByLabel(/description/i).fill(newDetails.description);
    }
    
    await this.saveButton.click();
    await this.expectSuccess();
  }

  /**
   * Delete calendar event
   */
  async deleteEvent(eventTitle: string) {
    const event = this.calendarEvents.locator(`:has-text("${eventTitle}")`);
    await event.click();
    
    await this.page.getByRole('button', { name: /delete/i }).click();
    await this.confirmAction();
    await this.expectSuccess();
  }

  /**
   * Filter events by type
   */
  async filterEvents(type: 'all' | 'tasks' | 'meetings' | 'personal') {
    await this.page.getByRole('button', { name: /filter/i }).click();
    await this.page.getByRole('option', { name: type }).click();
  }

  /**
   * Verify event exists on calendar
   */
  async verifyEventExists(eventTitle: string, date?: string) {
    if (date) {
      await this.navigateToDate(date);
    }
    
    await expect(this.calendarEvents.locator(`:has-text("${eventTitle}")`)).toBeVisible();
  }

  /**
   * Verify event does not exist
   */
  async verifyEventNotExists(eventTitle: string, date?: string) {
    if (date) {
      await this.navigateToDate(date);
    }
    
    await expect(this.calendarEvents.locator(`:has-text("${eventTitle}")`)).not.toBeVisible();
  }

  /**
   * Check for schedule conflicts
   */
  async checkForConflicts(dateTime: string) {
    await this.navigateToDate(dateTime.split('T')[0]);
    
    const conflictWarning = this.page.locator('[data-testid="schedule-conflict-warning"]');
    return await conflictWarning.isVisible();
  }
}