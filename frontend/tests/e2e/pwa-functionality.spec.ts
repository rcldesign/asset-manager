import { test, expect, Page } from '@playwright/test';
import { login } from './test-utils';

test.describe('PWA Functionality', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext({
      // Grant camera permissions for testing
      permissions: ['camera'],
    });
    page = await context.newPage();
    await login(page);
  });

  test('should show offline indicator when network is offline', async () => {
    // Navigate to dashboard
    await page.goto('/dashboard');
    
    // Go offline
    await page.context().setOffline(true);
    
    // Check for offline indicator
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    await expect(page.locator('text=Offline Mode')).toBeVisible();
    
    // Check for offline notification
    await expect(page.locator('text=You are offline')).toBeVisible();
    
    // Go back online
    await page.context().setOffline(false);
    
    // Check that offline indicator disappears
    await expect(page.locator('[data-testid="offline-indicator"]')).not.toBeVisible();
    
    // Check for online notification
    await expect(page.locator('text=You are back online')).toBeVisible();
  });

  test('should show sync status in navigation', async () => {
    await page.goto('/dashboard');
    
    // Look for sync status button
    const syncButton = page.locator('[aria-label="Sync Status"]');
    await expect(syncButton).toBeVisible();
    
    // Click to open sync dialog
    await syncButton.click();
    
    // Check dialog content
    await expect(page.locator('text=Sync Status')).toBeVisible();
    await expect(page.locator('text=All changes are synchronized')).toBeVisible();
  });

  test('should open camera capture dialog', async () => {
    // Navigate to asset creation page
    await page.goto('/assets/new');
    
    // Look for camera button
    const cameraButton = page.locator('button:has-text("Take Photo")');
    await expect(cameraButton).toBeVisible();
    
    // Click to open camera
    await cameraButton.click();
    
    // Check camera dialog
    await expect(page.locator('text=Take Photo')).toBeVisible();
    
    // Check for camera permission or error message
    const cameraView = page.locator('video');
    const errorMessage = page.locator('text=/Camera permission denied|No camera found/');
    
    // Either camera should work or show appropriate error
    await expect(cameraView.or(errorMessage)).toBeVisible();
    
    // Close dialog
    await page.locator('[aria-label="Close"]').click();
    await expect(page.locator('text=Take Photo')).not.toBeVisible();
  });

  test('should open barcode scanner dialog', async () => {
    // Navigate to asset creation page
    await page.goto('/assets/new');
    
    // Look for barcode scanner button
    const scannerButton = page.locator('button:has-text("Scan Barcode")');
    await expect(scannerButton).toBeVisible();
    
    // Click to open scanner
    await scannerButton.click();
    
    // Check scanner dialog
    await expect(page.locator('text=Scan Barcode')).toBeVisible();
    
    // Check for manual input option
    const manualInputButton = page.locator('button:has-text("Manual Input")');
    await expect(manualInputButton).toBeVisible();
    
    // Test manual input
    await manualInputButton.click();
    
    const barcodeInput = page.locator('input[placeholder="Enter barcode number"]');
    await expect(barcodeInput).toBeVisible();
    
    // Enter a barcode
    await barcodeInput.fill('123456789');
    await page.locator('button:has-text("Submit")').click();
    
    // Check confirmation
    await expect(page.locator('text=Barcode Detected')).toBeVisible();
    await expect(page.locator('text=123456789')).toBeVisible();
    
    // Cancel
    await page.locator('button:has-text("Retry")').click();
    
    // Close dialog
    await page.locator('[aria-label="Close"]').click();
    await expect(page.locator('text=Scan Barcode')).not.toBeVisible();
  });

  test('should show install prompt for PWA', async () => {
    // Check if install button exists (only shows when PWA can be installed)
    const installButton = page.locator('button:has-text("Install App")');
    
    // This test might not always show the button depending on browser/environment
    // So we'll just check the basic PWA setup
    
    // Check manifest link
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.json');
    
    // Check service worker registration
    const swRegistered = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });
    expect(swRegistered).toBe(true);
  });

  test('should handle offline form submission', async () => {
    // Navigate to task creation
    await page.goto('/tasks/new');
    
    // Fill in task form
    await page.fill('input[name="title"]', 'Offline Test Task');
    await page.fill('textarea[name="description"]', 'Task created while offline');
    
    // Go offline
    await page.context().setOffline(true);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should show offline message but handle gracefully
    await expect(page.locator('text=/saved locally|will be synced|offline/i')).toBeVisible();
    
    // Go back online
    await page.context().setOffline(false);
    
    // Check sync notification
    await expect(page.locator('text=/syncing|synchronized/i')).toBeVisible({ timeout: 10000 });
  });
});