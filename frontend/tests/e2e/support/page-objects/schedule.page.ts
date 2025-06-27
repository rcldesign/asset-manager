import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export interface SeasonalScheduleData {
  name: string;
  description?: string;
  seasons: string[];
  taskTemplate: string;
  dependencies?: string[];
  blackoutDates?: string[];
  businessDaysOnly?: boolean;
}

export interface UsageScheduleData {
  name: string;
  description?: string;
  counterType: 'HOURS' | 'CYCLES' | 'CUSTOM';
  threshold: number;
  taskTemplate: string;
}

export interface MonthlyScheduleData {
  name: string;
  description?: string;
  dayOfMonth: number;
  taskTemplate: string;
}

/**
 * Page Object for Advanced Schedule Management
 */
export class SchedulePage extends BasePage {
  // Navigation and main elements
  readonly schedulesList: Locator;
  readonly addScheduleButton: Locator;
  readonly scheduleFormDialog: Locator;
  
  // Form tabs
  readonly seasonalTab: Locator;
  readonly monthlyTab: Locator;
  readonly usageBasedTab: Locator;
  
  // Form fields
  readonly nameField: Locator;
  readonly descriptionField: Locator;
  readonly taskTemplateSelect: Locator;
  readonly businessDaysCheckbox: Locator;
  
  // Seasonal form fields
  readonly springCheckbox: Locator;
  readonly summerCheckbox: Locator;
  readonly fallCheckbox: Locator;
  readonly winterCheckbox: Locator;
  
  // Usage-based form fields
  readonly counterTypeSelect: Locator;
  readonly thresholdField: Locator;
  
  // Monthly form fields
  readonly dayOfMonthField: Locator;
  
  // Actions
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly deleteButton: Locator;
  
  // Blackout dates
  readonly addBlackoutDateButton: Locator;
  readonly blackoutDatePicker: Locator;
  
  // Dependencies
  readonly addDependencyButton: Locator;
  readonly dependencySelect: Locator;

  constructor(page: Page) {
    super(page);
    
    // Main elements
    this.schedulesList = page.locator('[data-testid="schedules-list"]');
    this.addScheduleButton = page.getByRole('button', { name: /add schedule|create schedule/i });
    this.scheduleFormDialog = page.locator('[role="dialog"][aria-labelledby*="schedule"]');
    
    // Form tabs
    this.seasonalTab = page.getByRole('tab', { name: /seasonal/i });
    this.monthlyTab = page.getByRole('tab', { name: /monthly/i });
    this.usageBasedTab = page.getByRole('tab', { name: /usage/i });
    
    // Common form fields
    this.nameField = page.getByLabel(/schedule name/i);
    this.descriptionField = page.getByLabel(/description/i);
    this.taskTemplateSelect = page.getByLabel(/task template/i);
    this.businessDaysCheckbox = page.getByLabel(/business days only/i);
    
    // Seasonal fields
    this.springCheckbox = page.getByLabel(/spring/i);
    this.summerCheckbox = page.getByLabel(/summer/i);
    this.fallCheckbox = page.getByLabel(/fall|autumn/i);
    this.winterCheckbox = page.getByLabel(/winter/i);
    
    // Usage-based fields
    this.counterTypeSelect = page.getByLabel(/counter type/i);
    this.thresholdField = page.getByLabel(/threshold|usage limit/i);
    
    // Monthly fields
    this.dayOfMonthField = page.getByLabel(/day of month/i);
    
    // Actions
    this.saveButton = page.getByRole('button', { name: /save|create/i });
    this.cancelButton = page.getByRole('button', { name: /cancel/i });
    this.deleteButton = page.getByRole('button', { name: /delete/i });
    
    // Advanced features
    this.addBlackoutDateButton = page.getByRole('button', { name: /add blackout date/i });
    this.blackoutDatePicker = page.locator('[data-testid="blackout-date-picker"]');
    this.addDependencyButton = page.getByRole('button', { name: /add dependency/i });
    this.dependencySelect = page.getByLabel(/dependency schedule/i);
  }

  /**
   * Navigate to schedules page
   */
  async goto() {
    await super.goto('/schedules');
  }

  /**
   * Open the create schedule dialog
   */
  async openCreateDialog() {
    await this.addScheduleButton.click();
    await expect(this.scheduleFormDialog).toBeVisible();
  }

  /**
   * Create a seasonal schedule
   */
  async createSeasonalSchedule(data: SeasonalScheduleData) {
    await this.openCreateDialog();
    await this.seasonalTab.click();
    
    // Fill basic information
    await this.nameField.fill(data.name);
    if (data.description) {
      await this.descriptionField.fill(data.description);
    }
    
    // Select task template
    await this.taskTemplateSelect.click();
    await this.page.getByRole('option', { name: data.taskTemplate }).click();
    
    // Select seasons
    for (const season of data.seasons) {
      switch (season.toLowerCase()) {
        case 'spring':
          await this.springCheckbox.check();
          break;
        case 'summer':
          await this.summerCheckbox.check();
          break;
        case 'fall':
        case 'autumn':
          await this.fallCheckbox.check();
          break;
        case 'winter':
          await this.winterCheckbox.check();
          break;
      }
    }
    
    // Set business days only if specified
    if (data.businessDaysOnly) {
      await this.businessDaysCheckbox.check();
    }
    
    // Add blackout dates if specified
    if (data.blackoutDates?.length) {
      for (const date of data.blackoutDates) {
        await this.addBlackoutDateButton.click();
        await this.blackoutDatePicker.fill(date);
      }
    }
    
    // Add dependencies if specified
    if (data.dependencies?.length) {
      for (const dependency of data.dependencies) {
        await this.addDependencyButton.click();
        await this.dependencySelect.click();
        await this.page.getByRole('option', { name: dependency }).click();
      }
    }
    
    // Save the schedule
    await this.saveButton.click();
    await expect(this.scheduleFormDialog).not.toBeVisible();
    await this.expectSuccess();
  }

  /**
   * Create a usage-based schedule
   */
  async createUsageBasedSchedule(data: UsageScheduleData) {
    await this.openCreateDialog();
    await this.usageBasedTab.click();
    
    // Fill basic information
    await this.nameField.fill(data.name);
    if (data.description) {
      await this.descriptionField.fill(data.description);
    }
    
    // Select counter type
    await this.counterTypeSelect.click();
    await this.page.getByRole('option', { name: data.counterType }).click();
    
    // Set threshold
    await this.thresholdField.fill(data.threshold.toString());
    
    // Select task template
    await this.taskTemplateSelect.click();
    await this.page.getByRole('option', { name: data.taskTemplate }).click();
    
    // Save the schedule
    await this.saveButton.click();
    await expect(this.scheduleFormDialog).not.toBeVisible();
    await this.expectSuccess();
  }

  /**
   * Create a monthly schedule
   */
  async createMonthlySchedule(data: MonthlyScheduleData) {
    await this.openCreateDialog();
    await this.monthlyTab.click();
    
    // Fill basic information
    await this.nameField.fill(data.name);
    if (data.description) {
      await this.descriptionField.fill(data.description);
    }
    
    // Set day of month
    await this.dayOfMonthField.fill(data.dayOfMonth.toString());
    
    // Select task template
    await this.taskTemplateSelect.click();
    await this.page.getByRole('option', { name: data.taskTemplate }).click();
    
    // Save the schedule
    await this.saveButton.click();
    await expect(this.scheduleFormDialog).not.toBeVisible();
    await this.expectSuccess();
  }

  /**
   * Edit an existing schedule
   */
  async editSchedule(scheduleName: string) {
    const scheduleRow = this.schedulesList.locator(`tr:has-text("${scheduleName}")`);
    const editButton = scheduleRow.getByRole('button', { name: /edit/i });
    await editButton.click();
    await expect(this.scheduleFormDialog).toBeVisible();
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleName: string) {
    const scheduleRow = this.schedulesList.locator(`tr:has-text("${scheduleName}")`);
    const deleteButton = scheduleRow.getByRole('button', { name: /delete/i });
    await deleteButton.click();
    await this.confirmAction();
    await this.expectSuccess();
  }

  /**
   * Verify schedule appears in list
   */
  async verifyScheduleExists(scheduleName: string) {
    await expect(this.schedulesList.getByText(scheduleName)).toBeVisible();
  }

  /**
   * Verify schedule does not appear in list
   */
  async verifyScheduleNotExists(scheduleName: string) {
    await expect(this.schedulesList.getByText(scheduleName)).not.toBeVisible();
  }

  /**
   * Get schedule status/next run information
   */
  async getScheduleInfo(scheduleName: string) {
    const scheduleRow = this.schedulesList.locator(`tr:has-text("${scheduleName}")`);
    const status = await scheduleRow.locator('[data-testid="schedule-status"]').textContent();
    const nextRun = await scheduleRow.locator('[data-testid="next-run"]').textContent();
    
    return { status, nextRun };
  }
}