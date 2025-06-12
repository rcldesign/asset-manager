import { test, expect } from '@playwright/test';
import { AuthTestUtils, testUsers } from './test-utils';

test.describe('Complete Authentication Flow', () => {
  let authUtils: AuthTestUtils;

  test.beforeEach(async ({ page }) => {
    authUtils = new AuthTestUtils(page);
  });

  test('complete user journey: register → login → dashboard → logout', async ({ page }) => {
    // Step 1: Set up mocks for registration
    await page.route('**/api/auth/register', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user: testUsers.member,
          message: 'Registration successful'
        })
      });
    });

    await authUtils.setupSuccessfulAuthMocks(testUsers.member);

    // Step 2: Navigate to home and get redirected to login
    await page.goto('/');
    await authUtils.expectLoginPage();

    // Step 3: Navigate to registration
    await page.getByText('Sign up').click();
    await authUtils.expectRegisterPage();

    // Step 4: Register new user
    await authUtils.register({
      fullName: 'New Member',
      email: 'newmember@example.com',
      password: 'SecurePass123!'
    });

    // Step 5: Should be redirected to dashboard after registration
    await authUtils.expectDashboardPage();

    // Step 6: Verify user info is displayed
    await expect(page.getByText('Member User')).toBeVisible();
    await expect(page.getByText('member@example.com')).toBeVisible();
    await expect(page.getByText('Member')).toBeVisible();

    // Step 7: Logout
    await page.getByRole('button', { name: 'Sign Out' }).click();

    // Step 8: Should be redirected to login
    await authUtils.expectLoginPage();

    // Step 9: Login again with same credentials
    await authUtils.login('member@example.com', 'SecurePass123!');

    // Step 10: Should be back on dashboard
    await authUtils.expectDashboardPage();
  });

  test('authentication state persistence across browser tabs', async ({ page, context }) => {
    // Set up successful auth
    await authUtils.setupSuccessfulAuthMocks(testUsers.owner);

    // Login in first tab
    await authUtils.login('owner@example.com', 'password123');
    await authUtils.expectDashboardPage();

    // Open new tab
    const newTab = await context.newPage();
    const newAuthUtils = new AuthTestUtils(newTab);
    await newAuthUtils.setupSuccessfulAuthMocks(testUsers.owner);

    // Navigate to app in new tab - should be authenticated
    await newTab.goto('/');
    await newAuthUtils.expectDashboardPage();

    // Logout in first tab
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await authUtils.expectLoginPage();

    // New tab should also be logged out (if using shared auth storage)
    await newTab.reload();
    await newAuthUtils.expectLoginPage();

    await newTab.close();
  });

  test('role-based access control display', async ({ page }) => {
    // Test different user roles show appropriate information
    const roles = [testUsers.owner, testUsers.manager, testUsers.member, testUsers.viewer];

    for (const user of roles) {
      // Set up auth for current user
      await authUtils.setupSuccessfulAuthMocks(user);

      // Login
      await authUtils.login(user.email, 'password123');
      await authUtils.expectDashboardPage();

      // Verify role is displayed correctly
      await expect(page.getByText(user.role)).toBeVisible();
      await expect(page.getByText(user.fullName)).toBeVisible();
      await expect(page.getByText(user.email)).toBeVisible();

      // Logout for next iteration
      await page.getByRole('button', { name: 'Sign Out' }).click();
      await authUtils.expectLoginPage();
    }
  });

  test('protected route access patterns', async ({ page }) => {
    // Test accessing protected routes without authentication
    const protectedRoutes = ['/dashboard'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await authUtils.expectLoginPage();
    }

    // Login and test access to protected routes
    await authUtils.setupSuccessfulAuthMocks(testUsers.owner);
    await authUtils.login('owner@example.com', 'password123');

    for (const route of protectedRoutes) {
      await page.goto(route);
      if (route === '/dashboard') {
        await authUtils.expectDashboardPage();
      }
    }
  });

  test('authentication error handling and recovery', async ({ page }) => {
    // Test various error scenarios and recovery

    // 1. Invalid credentials
    await authUtils.setupFailedAuthMocks('Invalid email or password');
    await authUtils.login('wrong@example.com', 'wrongpassword');
    
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await authUtils.expectLoginPage();

    // 2. Network error during login
    await page.route('**/api/auth/login', route => route.abort('failed'));
    await authUtils.login('test@example.com', 'password123');
    
    // Should show some kind of error (network error handling)
    // This might vary based on implementation
    await authUtils.expectLoginPage();

    // 3. Successful login after errors
    await authUtils.setupSuccessfulAuthMocks(testUsers.owner);
    await authUtils.login('owner@example.com', 'password123');
    await authUtils.expectDashboardPage();
  });

  test('form validation and user experience', async ({ page }) => {
    // Test comprehensive form validation

    // Registration form validation
    await page.goto('/register');

    // Test required fields
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByLabel('Full Name')).toBeFocused();

    // Test password confirmation
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByLabel('Confirm Password').fill('different');
    
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeDisabled();

    // Fix password and submit
    await page.getByLabel('Confirm Password').fill('password123');
    await expect(page.getByText('Passwords do not match')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeEnabled();

    // Login form validation
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByLabel('Email Address')).toBeFocused();
  });

  test('responsive design across device sizes', async ({ page }) => {
    const viewports = [
      { width: 375, height: 667, name: 'Mobile' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1920, height: 1080, name: 'Desktop' }
    ];

    await authUtils.setupSuccessfulAuthMocks(testUsers.owner);

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Test login page
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
      await expect(page.getByLabel('Email Address')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();

      // Test registration page
      await page.goto('/register');
      await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible();
      await expect(page.getByLabel('Full Name')).toBeVisible();

      // Test dashboard
      await authUtils.login('owner@example.com', 'password123');
      await authUtils.expectDashboardPage();
      await expect(page.getByText('Welcome to DumbAssets Enhanced')).toBeVisible();

      // Logout for next iteration
      await page.getByRole('button', { name: 'Sign Out' }).click();
    }
  });

  test('accessibility features', async ({ page }) => {
    // Test keyboard navigation
    await page.goto('/login');

    // Tab through form elements
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Email Address')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeFocused();

    // Test form submission with Enter key
    await page.getByLabel('Email Address').focus();
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    
    await authUtils.setupFailedAuthMocks();
    await page.keyboard.press('Enter');
    
    // Should attempt login
    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  });

  test('loading states and user feedback', async ({ page }) => {
    // Test loading states during various operations
    
    // Login loading state
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    
    // Delay the response to see loading state
    await page.route('**/api/auth/login', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: testUsers.owner,
          message: 'Login successful'
        })
      });
    });

    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('button', { name: 'Signing in...' })).toBeVisible();

    // Should eventually succeed
    await authUtils.expectDashboardPage();
  });
});