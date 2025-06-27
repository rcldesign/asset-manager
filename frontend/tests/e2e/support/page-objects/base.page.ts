import { Page, Locator, expect } from '@playwright/test';

/**
 * Base page object class with common functionality
 */
export abstract class BasePage {
  readonly page: Page;
  
  // Common selectors
  readonly loadingSpinner: Locator;
  readonly errorAlert: Locator;
  readonly successAlert: Locator;
  readonly confirmDialog: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Common UI elements
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"], .MuiCircularProgress-root');
    this.errorAlert = page.locator('[role="alert"][data-severity="error"], .MuiAlert-standardError');
    this.successAlert = page.locator('[role="alert"][data-severity="success"], .MuiAlert-standardSuccess');
    this.confirmDialog = page.locator('[role="dialog"][aria-labelledby*="confirm"]');
    this.confirmButton = page.getByRole('button', { name: /confirm|delete|ok|yes/i });
    this.cancelButton = page.getByRole('button', { name: /cancel|no/i });
  }

  /**
   * Wait for page to load completely
   */
  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
    await expect(this.loadingSpinner).not.toBeVisible({ timeout: 10000 });
  }

  /**
   * Navigate to a specific route
   */
  async goto(path: string) {
    await this.page.goto(path);
    await this.waitForLoad();
  }

  /**
   * Wait for and verify success message
   */
  async expectSuccess(message?: string) {
    await expect(this.successAlert).toBeVisible({ timeout: 5000 });
    if (message) {
      await expect(this.successAlert).toContainText(message);
    }
  }

  /**
   * Wait for and verify error message
   */
  async expectError(message?: string) {
    await expect(this.errorAlert).toBeVisible({ timeout: 5000 });
    if (message) {
      await expect(this.errorAlert).toContainText(message);
    }
  }

  /**
   * Handle confirmation dialogs
   */
  async confirmAction() {
    await expect(this.confirmDialog).toBeVisible();
    await this.confirmButton.click();
    await expect(this.confirmDialog).not.toBeVisible();
  }

  /**
   * Cancel confirmation dialogs
   */
  async cancelAction() {
    await expect(this.confirmDialog).toBeVisible();
    await this.cancelButton.click();
    await expect(this.confirmDialog).not.toBeVisible();
  }

  /**
   * Fill form field by label
   */
  async fillField(label: string, value: string) {
    await this.page.getByLabel(label).fill(value);
  }

  /**
   * Select option from dropdown by label
   */
  async selectOption(label: string, option: string) {
    await this.page.getByLabel(label).click();
    await this.page.getByRole('option', { name: option }).click();
  }

  /**
   * Click button by name or role
   */
  async clickButton(name: string) {
    await this.page.getByRole('button', { name }).click();
  }

  /**
   * Login with user token
   */
  async loginWithToken(token: string) {
    // Set authentication token in localStorage
    await this.page.addInitScript((token) => {
      localStorage.setItem('auth-token', token);
    }, token);
    
    // Navigate to dashboard to trigger authentication
    await this.goto('/dashboard');
  }

  /**
   * Logout current user
   */
  async logout() {
    await this.page.getByRole('button', { name: /logout|sign out/i }).click();
    await this.page.waitForURL('/login');
  }

  /**
   * Wait for specific text to appear on page
   */
  async waitForText(text: string, timeout = 5000) {
    await expect(this.page.getByText(text)).toBeVisible({ timeout });
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png` });
  }
}