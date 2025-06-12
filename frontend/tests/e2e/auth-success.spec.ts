import { test, expect } from '@playwright/test';

test.describe('Successful Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Mock successful authentication response
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: '1',
            email: 'test@example.com',
            fullName: 'Test User',
            role: 'Owner',
            organizationId: 'org-1',
            hasEnabledTwoFactor: false,
          },
          message: 'Login successful'
        })
      });
    });

    // Mock user profile fetch
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'Owner',
          organizationId: 'org-1',
          hasEnabledTwoFactor: false,
        })
      });
    });

    // Mock logout
    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Logged out successfully' })
      });
    });
  });

  test('should successfully login and redirect to dashboard', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in credentials
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    
    // Should show welcome message
    await expect(page.getByText('Welcome to DumbAssets Enhanced')).toBeVisible();
    
    // Should show user information
    await expect(page.getByText('Test User')).toBeVisible();
    await expect(page.getByText('test@example.com')).toBeVisible();
    await expect(page.getByText('Owner')).toBeVisible();
  });

  test('should show authenticated user info on dashboard', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Check user information card
    const userCard = page.locator('.MuiCard-root').first();
    await expect(userCard.getByText('User Information')).toBeVisible();
    await expect(userCard.getByText('Name: Test User')).toBeVisible();
    await expect(userCard.getByText('Email: test@example.com')).toBeVisible();
    await expect(userCard.getByText('Role:')).toBeVisible();
    await expect(userCard.getByText('Owner')).toBeVisible();
    await expect(userCard.getByText('Organization ID: org-1')).toBeVisible();
    await expect(userCard.getByText('2FA Enabled: ❌ No')).toBeVisible();
  });

  test('should successfully logout from dashboard', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Click logout button
    await page.getByRole('button', { name: 'Sign Out' }).click();
    
    // Should show loading state
    await expect(page.getByText('Signing out...')).toBeVisible();
    
    // Should redirect to login
    await expect(page).toHaveURL('/login', { timeout: 10000 });
    
    // Should show login form again
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });

  test('should redirect authenticated user from login page to dashboard', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Try to go back to login
    await page.goto('/login');
    
    // Should redirect back to dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('should redirect authenticated user from register page to dashboard', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Try to go to register
    await page.goto('/register');
    
    // Should redirect back to dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show phase 1 completion message', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Should show phase 1 completion card
    await expect(page.getByText('Phase 1 Frontend Complete! 🎉')).toBeVisible();
    
    // Should list completed features
    await expect(page.getByText('✅ Next.js frontend with TypeScript')).toBeVisible();
    await expect(page.getByText('✅ Material-UI (MUI) components')).toBeVisible();
    await expect(page.getByText('✅ Zustand state management')).toBeVisible();
    await expect(page.getByText('✅ React Query for API state')).toBeVisible();
    await expect(page.getByText('✅ Authentication flow with JWT')).toBeVisible();
    await expect(page.getByText('✅ Protected routes with role-based access')).toBeVisible();
  });

  test('should maintain authentication state across page refreshes', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Refresh the page
    await page.reload();
    
    // Should still be on dashboard (auth state maintained)
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('Welcome to DumbAssets Enhanced')).toBeVisible();
  });
});