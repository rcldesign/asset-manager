import { test, expect } from '@playwright/test';

test.describe('User Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock successful registration
    await page.route('**/api/auth/register', async (route) => {
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');
      
      // Simulate different scenarios based on email
      if (postData.email === 'existing@example.com') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              message: 'A user with this email already exists'
            }
          })
        });
      } else if (postData.email === 'newuser@example.com') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: '2',
              email: postData.email,
              fullName: postData.fullName,
              role: 'Member',
              organizationId: 'org-1',
              hasEnabledTwoFactor: false,
            },
            message: 'Registration successful'
          })
        });
      } else {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              message: 'Internal server error'
            }
          })
        });
      }
    });

    // Mock user profile fetch after registration
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '2',
          email: 'newuser@example.com',
          fullName: 'New User',
          role: 'Member',
          organizationId: 'org-1',
          hasEnabledTwoFactor: false,
        })
      });
    });
  });

  test('should display registration form correctly', async ({ page }) => {
    await page.goto('/register');
    
    // Check form elements
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByText('Create your DumbAssets Enhanced account')).toBeVisible();
    
    await expect(page.getByLabel('Full Name')).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
    
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByText('Already have an account?')).toBeVisible();
    await expect(page.getByText('Sign in')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/register');
    
    // Try to submit empty form
    await page.getByRole('button', { name: 'Sign Up' }).click();
    
    // HTML5 validation should prevent submission
    // Browser will focus on the first required field
    await expect(page.getByLabel('Full Name')).toBeFocused();
  });

  test('should validate password confirmation', async ({ page }) => {
    await page.goto('/register');
    
    // Fill form with mismatched passwords
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByLabel('Confirm Password').fill('different');
    
    // Should show validation error
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    
    // Submit button should be disabled
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeDisabled();
    
    // Confirm password field should show error state
    await expect(page.getByLabel('Confirm Password')).toHaveAttribute('aria-invalid', 'true');
  });

  test('should enable submit when passwords match', async ({ page }) => {
    await page.goto('/register');
    
    // Fill form with matching passwords
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByLabel('Confirm Password').fill('password123');
    
    // Submit button should be enabled
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeEnabled();
    
    // No validation error should be shown
    await expect(page.getByText('Passwords do not match')).not.toBeVisible();
  });

  test('should successfully register new user and redirect to dashboard', async ({ page }) => {
    await page.goto('/register');
    
    // Fill registration form
    await page.getByLabel('Full Name').fill('New User');
    await page.getByLabel('Email Address').fill('newuser@example.com');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByLabel('Confirm Password').fill('Password123!');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign Up' }).click();
    
    // Should show loading state
    await expect(page.getByRole('button', { name: 'Creating account...' })).toBeVisible();
    
    // Should redirect to dashboard after successful registration
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    
    // Should show user information
    await expect(page.getByText('New User')).toBeVisible();
    await expect(page.getByText('newuser@example.com')).toBeVisible();
  });

  test('should show error for existing email', async ({ page }) => {
    await page.goto('/register');
    
    // Fill form with existing email
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email Address').fill('existing@example.com');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByLabel('Confirm Password').fill('Password123!');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign Up' }).click();
    
    // Should show error message
    await expect(page.getByText('A user with this email already exists')).toBeVisible();
    
    // Should remain on registration page
    await expect(page).toHaveURL('/register');
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible();
  });

  test('should show generic error for server errors', async ({ page }) => {
    await page.goto('/register');
    
    // Fill form with email that triggers server error
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email Address').fill('error@example.com');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByLabel('Confirm Password').fill('Password123!');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign Up' }).click();
    
    // Should show error message
    await expect(page.getByText('Internal server error')).toBeVisible();
    
    // Should remain on registration page
    await expect(page).toHaveURL('/register');
  });

  test('should disable form during submission', async ({ page }) => {
    await page.goto('/register');
    
    // Fill form
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email Address').fill('newuser@example.com');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByLabel('Confirm Password').fill('Password123!');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign Up' }).click();
    
    // All form fields should be disabled during submission
    await expect(page.getByLabel('Full Name')).toBeDisabled();
    await expect(page.getByLabel('Email Address')).toBeDisabled();
    await expect(page.getByLabel('Password')).toBeDisabled();
    await expect(page.getByLabel('Confirm Password')).toBeDisabled();
  });

  test('should navigate to login page from registration', async ({ page }) => {
    await page.goto('/register');
    
    // Click "Sign in" link
    await page.getByText('Sign in').click();
    
    // Should redirect to login page
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });

  test('should maintain form validation state during typing', async ({ page }) => {
    await page.goto('/register');
    
    // Fill password
    await page.getByLabel('Password').fill('password123');
    
    // Start typing in confirm password - should show error initially
    await page.getByLabel('Confirm Password').fill('pass');
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    
    // Complete matching password - error should disappear
    await page.getByLabel('Confirm Password').fill('password123');
    await expect(page.getByText('Passwords do not match')).not.toBeVisible();
  });

  test('should clear password confirmation error when password changes', async ({ page }) => {
    await page.goto('/register');
    
    // Set up password mismatch
    await page.getByLabel('Password').fill('password123');
    await page.getByLabel('Confirm Password').fill('different');
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    
    // Change password - should still show error until confirm password is updated
    await page.getByLabel('Password').fill('newpassword');
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    
    // Update confirm password to match
    await page.getByLabel('Confirm Password').fill('newpassword');
    await expect(page.getByText('Passwords do not match')).not.toBeVisible();
  });

  test('should handle responsive layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/register');
    
    // Form should be visible and usable
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByLabel('Full Name')).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
    
    // Submit button should be visible
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
  });

  test('should show loading icon during registration', async ({ page }) => {
    await page.goto('/register');
    
    // Fill form
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email Address').fill('newuser@example.com');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByLabel('Confirm Password').fill('Password123!');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign Up' }).click();
    
    // Should show loading button with icon
    const loadingButton = page.getByRole('button', { name: 'Creating account...' });
    await expect(loadingButton).toBeVisible();
    
    // Button should contain loading icon (CircularProgress)
    await expect(loadingButton.locator('.MuiCircularProgress-root')).toBeVisible();
  });
});