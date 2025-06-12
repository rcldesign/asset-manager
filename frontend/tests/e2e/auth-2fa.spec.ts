import { test, expect } from '@playwright/test';

test.describe('Two-Factor Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock initial login that requires 2FA
    await page.route('**/api/auth/login', async (route) => {
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');
      
      // If no twoFactorCode provided, require 2FA
      if (!postData.twoFactorCode) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            requiresTwoFactor: true,
            message: 'Two-factor authentication required'
          })
        });
      } else {
        // If 2FA code provided
        if (postData.twoFactorCode === '123456') {
          // Valid 2FA code
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              user: {
                id: '1',
                email: 'user-2fa@example.com',
                fullName: 'User With 2FA',
                role: 'Manager',
                organizationId: 'org-1',
                hasEnabledTwoFactor: true,
              },
              message: 'Login successful'
            })
          });
        } else {
          // Invalid 2FA code
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                message: 'Invalid two-factor authentication code'
              }
            })
          });
        }
      }
    });

    // Mock user profile fetch
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '1',
          email: 'user-2fa@example.com',
          fullName: 'User With 2FA',
          role: 'Manager',
          organizationId: 'org-1',
          hasEnabledTwoFactor: true,
        })
      });
    });
  });

  test('should show 2FA input when login requires two-factor auth', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in credentials
    await page.getByLabel('Email Address').fill('user-2fa@example.com');
    await page.getByLabel('Password').fill('password123');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Should show 2FA input field
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Verify Code' })).toBeVisible();
    
    // Should show help text
    await expect(page.getByText(/enter the 6-digit code/i)).toBeVisible();
    
    // Email and password fields should be hidden
    await expect(page.getByLabel('Email Address')).not.toBeVisible();
    await expect(page.getByLabel('Password')).not.toBeVisible();
  });

  test('should successfully complete 2FA login with valid code', async ({ page }) => {
    await page.goto('/login');
    
    // Initial login
    await page.getByLabel('Email Address').fill('user-2fa@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for 2FA input
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
    
    // Enter valid 2FA code
    await page.getByLabel('Two-Factor Code').fill('123456');
    await page.getByRole('button', { name: 'Verify Code' }).click();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    
    // Should show user with 2FA enabled
    await expect(page.getByText('User With 2FA')).toBeVisible();
    await expect(page.getByText('2FA Enabled: ✅ Yes')).toBeVisible();
  });

  test('should show error for invalid 2FA code', async ({ page }) => {
    await page.goto('/login');
    
    // Initial login
    await page.getByLabel('Email Address').fill('user-2fa@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for 2FA input
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
    
    // Enter invalid 2FA code
    await page.getByLabel('Two-Factor Code').fill('999999');
    await page.getByRole('button', { name: 'Verify Code' }).click();
    
    // Should show error message
    await expect(page.getByText(/invalid two-factor authentication code/i)).toBeVisible();
    
    // Should remain on 2FA input
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
  });

  test('should handle back to login from 2FA step', async ({ page }) => {
    await page.goto('/login');
    
    // Initial login
    await page.getByLabel('Email Address').fill('user-2fa@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for 2FA input
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
    
    // Click back to login button
    await page.getByRole('button', { name: 'Back to Login' }).click();
    
    // Should show login form again
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    
    // 2FA input should be hidden
    await expect(page.getByLabel('Two-Factor Code')).not.toBeVisible();
  });

  test('should show loading state during 2FA verification', async ({ page }) => {
    await page.goto('/login');
    
    // Initial login
    await page.getByLabel('Email Address').fill('user-2fa@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for 2FA input
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
    
    // Enter 2FA code and submit
    await page.getByLabel('Two-Factor Code').fill('123456');
    await page.getByRole('button', { name: 'Verify Code' }).click();
    
    // Should show loading state
    await expect(page.getByRole('button', { name: 'Verifying...' })).toBeVisible();
  });

  test('should validate 2FA code format', async ({ page }) => {
    await page.goto('/login');
    
    // Initial login
    await page.getByLabel('Email Address').fill('user-2fa@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for 2FA input
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
    
    // Try to enter invalid format (too short)
    await page.getByLabel('Two-Factor Code').fill('123');
    
    // Verify button should be disabled or show validation
    const verifyButton = page.getByRole('button', { name: 'Verify Code' });
    
    // Try to submit - should not work with incomplete code
    await verifyButton.click();
    
    // Should still be on 2FA page (form validation prevents submission)
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
  });

  test('should auto-focus 2FA input when shown', async ({ page }) => {
    await page.goto('/login');
    
    // Initial login
    await page.getByLabel('Email Address').fill('user-2fa@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for 2FA input and check it's focused
    const twoFactorInput = page.getByLabel('Two-Factor Code');
    await expect(twoFactorInput).toBeVisible();
    await expect(twoFactorInput).toBeFocused();
  });

  test('should clear 2FA input when returning to login', async ({ page }) => {
    await page.goto('/login');
    
    // Initial login
    await page.getByLabel('Email Address').fill('user-2fa@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for 2FA input
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
    
    // Enter some code
    await page.getByLabel('Two-Factor Code').fill('123');
    
    // Go back to login
    await page.getByRole('button', { name: 'Back to Login' }).click();
    
    // Try 2FA flow again
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
    
    // 2FA input should be empty
    await expect(page.getByLabel('Two-Factor Code')).toHaveValue('');
  });
});