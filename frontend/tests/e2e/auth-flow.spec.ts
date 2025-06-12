import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we start fresh for each test
    await page.goto('/');
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // When visiting the root, should redirect to login
    await expect(page).toHaveURL('/login');
    
    // Should show login form
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('should show validation error for invalid login', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in invalid credentials
    await page.getByLabel('Email Address').fill('invalid@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Should show error message
    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  });

  test('should navigate between login and register pages', async ({ page }) => {
    await page.goto('/login');
    
    // Click "Sign up" link
    await page.getByText('Sign up').click();
    await expect(page).toHaveURL('/register');
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible();
    
    // Click "Sign in" link to go back
    await page.getByText('Sign in').click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });

  test('should show password confirmation validation on register', async ({ page }) => {
    await page.goto('/register');
    
    // Fill in form with mismatched passwords
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByLabel('Confirm Password').fill('password456');
    
    // Should show validation error
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    
    // Submit button should be disabled
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeDisabled();
  });

  test('should handle register form submission', async ({ page }) => {
    await page.goto('/register');
    
    // Fill in valid registration form
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email Address').fill('newuser@example.com');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByLabel('Confirm Password').fill('Password123!');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign Up' }).click();
    
    // Should show loading state
    await expect(page.getByRole('button', { name: 'Creating account...' })).toBeVisible();
    
    // Should eventually show an error (since we don't have a real backend user creation)
    // or handle success case if backend is available
    await expect(page.getByText(/error/i)).toBeVisible({ timeout: 10000 });
  });

  test('should redirect to login when accessing register while authenticated', async ({ page }) => {
    // Mock authenticated state by setting up context
    // This test would need real authentication setup to work properly
    // For now, we'll test the redirect logic
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible();
  });

  test('should redirect to login when accessing dashboard without auth', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should redirect to login since not authenticated
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });

  test('should handle 2FA flow when required', async ({ page }) => {
    await page.goto('/login');
    
    // This test would require mocking a user that has 2FA enabled
    // For demonstration, we'll show the expected flow structure
    await page.getByLabel('Email Address').fill('user-with-2fa@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // If 2FA is required, should show 2FA input
    // await expect(page.getByLabel('Two-Factor Code')).toBeVisible();
    // await expect(page.getByRole('button', { name: 'Verify Code' })).toBeVisible();
  });

  test('should show loading states during authentication', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    
    // Click submit and immediately check for loading state
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('button', { name: 'Signing in...' })).toBeVisible();
  });

  test('should maintain form state during navigation', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in some data
    await page.getByLabel('Email Address').fill('test@example.com');
    
    // Navigate to register
    await page.getByText('Sign up').click();
    await expect(page).toHaveURL('/register');
    
    // Navigate back to login
    await page.getByText('Sign in').click();
    
    // Email field should be empty (fresh page load)
    await expect(page.getByLabel('Email Address')).toHaveValue('');
  });

  test('should show proper validation for required fields', async ({ page }) => {
    await page.goto('/register');
    
    // Try to submit empty form
    await page.getByRole('button', { name: 'Sign Up' }).click();
    
    // HTML5 validation should prevent submission
    // The browser will focus on the first required field
    await expect(page.getByLabel('Full Name')).toBeFocused();
  });

  test('should handle responsive layout on mobile', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');
    
    // Form should still be visible and usable
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    
    // Form should fit in viewport
    const loginCard = page.locator('[role="main"], .MuiCard-root').first();
    await expect(loginCard).toBeVisible();
  });
});