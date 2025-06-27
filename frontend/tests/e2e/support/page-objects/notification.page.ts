import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object for Notification Management
 */
export class NotificationPage extends BasePage {
  // Navigation and main elements
  readonly notificationsList: Locator;
  readonly notificationBadge: Locator;
  readonly markAllReadButton: Locator;
  readonly notificationFilters: Locator;
  
  // Notification items
  readonly unreadNotifications: Locator;
  readonly readNotifications: Locator;
  readonly mentionNotifications: Locator;
  readonly taskNotifications: Locator;
  
  // Notification actions
  readonly markReadButton: Locator;
  readonly markUnreadButton: Locator;
  readonly deleteNotificationButton: Locator;
  
  // Settings
  readonly notificationSettings: Locator;
  readonly emailToggle: Locator;
  readonly pushToggle: Locator;
  readonly mentionToggle: Locator;

  constructor(page: Page) {
    super(page);
    
    // Main elements
    this.notificationsList = page.locator('[data-testid="notifications-list"]');
    this.notificationBadge = page.locator('[data-testid="notification-badge"]');
    this.markAllReadButton = page.getByRole('button', { name: /mark all read/i });
    this.notificationFilters = page.locator('[data-testid="notification-filters"]');
    
    // Notification types
    this.unreadNotifications = page.locator('[data-testid="notification-item"][data-read="false"]');
    this.readNotifications = page.locator('[data-testid="notification-item"][data-read="true"]');
    this.mentionNotifications = page.locator('[data-testid="notification-item"][data-type="mention"]');
    this.taskNotifications = page.locator('[data-testid="notification-item"][data-type="task"]');
    
    // Actions
    this.markReadButton = page.getByRole('button', { name: /mark read/i });
    this.markUnreadButton = page.getByRole('button', { name: /mark unread/i });
    this.deleteNotificationButton = page.getByRole('button', { name: /delete/i });
    
    // Settings
    this.notificationSettings = page.locator('[data-testid="notification-settings"]');
    this.emailToggle = page.getByLabel(/email notifications/i);
    this.pushToggle = page.getByLabel(/push notifications/i);
    this.mentionToggle = page.getByLabel(/mention notifications/i);
  }

  /**
   * Navigate to notifications page
   */
  async goto() {
    await super.goto('/notifications');
  }

  /**
   * Open notification settings
   */
  async openSettings() {
    await this.page.getByRole('button', { name: /notification settings/i }).click();
    await expect(this.notificationSettings).toBeVisible();
  }

  /**
   * Filter notifications by type
   */
  async filterBy(type: 'all' | 'unread' | 'mentions' | 'tasks') {
    await this.notificationFilters.getByRole('button', { name: type }).click();
  }

  /**
   * Mark specific notification as read
   */
  async markNotificationRead(notificationText: string) {
    const notification = this.notificationsList.locator(`[data-testid="notification-item"]:has-text("${notificationText}")`);
    await notification.hover();
    await notification.getByRole('button', { name: /mark read/i }).click();
  }

  /**
   * Mark all notifications as read
   */
  async markAllRead() {
    await this.markAllReadButton.click();
    await this.expectSuccess();
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationText: string) {
    const notification = this.notificationsList.locator(`[data-testid="notification-item"]:has-text("${notificationText}")`);
    await notification.hover();
    await notification.getByRole('button', { name: /delete/i }).click();
    await this.confirmAction();
  }

  /**
   * Get notification count from badge
   */
  async getNotificationCount(): Promise<number> {
    const badgeText = await this.notificationBadge.textContent();
    return parseInt(badgeText || '0');
  }

  /**
   * Verify notification exists with specific content
   */
  async verifyNotificationExists(content: string) {
    await expect(this.notificationsList.getByText(content)).toBeVisible();
  }

  /**
   * Verify notification does not exist
   */
  async verifyNotificationNotExists(content: string) {
    await expect(this.notificationsList.getByText(content)).not.toBeVisible();
  }

  /**
   * Click on a notification to navigate to its source
   */
  async clickNotification(content: string) {
    const notification = this.notificationsList.locator(`[data-testid="notification-item"]:has-text("${content}")`);
    await notification.click();
  }

  /**
   * Enable/disable email notifications
   */
  async toggleEmailNotifications(enabled: boolean) {
    await this.openSettings();
    
    if (enabled) {
      await this.emailToggle.check();
    } else {
      await this.emailToggle.uncheck();
    }
    
    await this.saveButton.click();
    await this.expectSuccess();
  }

  /**
   * Enable/disable push notifications
   */
  async togglePushNotifications(enabled: boolean) {
    await this.openSettings();
    
    if (enabled) {
      await this.pushToggle.check();
    } else {
      await this.pushToggle.uncheck();
    }
    
    await this.saveButton.click();
    await this.expectSuccess();
  }

  /**
   * Get all unread notifications count
   */
  async getUnreadCount(): Promise<number> {
    return await this.unreadNotifications.count();
  }

  /**
   * Get all mention notifications count
   */
  async getMentionCount(): Promise<number> {
    return await this.mentionNotifications.count();
  }

  /**
   * Verify real-time notification appears
   */
  async waitForRealTimeNotification(content: string, timeout = 10000) {
    await expect(this.notificationsList.getByText(content)).toBeVisible({ timeout });
  }
}