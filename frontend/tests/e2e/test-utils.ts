import { Page, expect } from '@playwright/test';

export class AuthTestUtils {
  constructor(private page: Page) {}

  /**
   * Set up mock routes for successful authentication
   */
  async setupSuccessfulAuthMocks(userOverrides: Partial<any> = {}) {
    const defaultUser = {
      id: '1',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'Owner',
      organizationId: 'org-1',
      hasEnabledTwoFactor: false,
      ...userOverrides
    };

    // Mock login
    await this.page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: defaultUser,
          message: 'Login successful'
        })
      });
    });

    // Mock user profile fetch
    await this.page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(defaultUser)
      });
    });

    // Mock logout
    await this.page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Logged out successfully' })
      });
    });
  }

  /**
   * Set up mock routes for failed authentication
   */
  async setupFailedAuthMocks(errorMessage = 'Invalid credentials') {
    await this.page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: errorMessage }
        })
      });
    });
  }

  /**
   * Set up mock routes for 2FA authentication flow
   */
  async setup2FAMocks(validCode = '123456') {
    await this.page.route('**/api/auth/login', async (route) => {
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');
      
      if (!postData.twoFactorCode) {
        // First login request - require 2FA
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            requiresTwoFactor: true,
            message: 'Two-factor authentication required'
          })
        });
      } else if (postData.twoFactorCode === validCode) {
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
            error: { message: 'Invalid two-factor authentication code' }
          })
        });
      }
    });
  }

  /**
   * Perform a login with given credentials
   */
  async login(email: string, password: string) {
    await this.page.goto('/login');
    await this.page.getByLabel('Email Address').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }

  /**
   * Fill registration form with given data
   */
  async register(data: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword?: string;
  }) {
    await this.page.goto('/register');
    await this.page.getByLabel('Full Name').fill(data.fullName);
    await this.page.getByLabel('Email Address').fill(data.email);
    await this.page.getByLabel('Password').fill(data.password);
    await this.page.getByLabel('Confirm Password').fill(data.confirmPassword || data.password);
    await this.page.getByRole('button', { name: 'Sign Up' }).click();
  }

  /**
   * Assert that we're on the login page
   */
  async expectLoginPage() {
    await expect(this.page).toHaveURL('/login');
    await expect(this.page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  }

  /**
   * Assert that we're on the dashboard page
   */
  async expectDashboardPage() {
    await expect(this.page).toHaveURL('/dashboard');
    await expect(this.page.getByText('Welcome to DumbAssets Enhanced')).toBeVisible();
  }

  /**
   * Assert that we're on the register page
   */
  async expectRegisterPage() {
    await expect(this.page).toHaveURL('/register');
    await expect(this.page.getByRole('heading', { name: 'Sign Up' })).toBeVisible();
  }

  /**
   * Wait for loading to complete
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }
}

export class MockAPI {
  constructor(private page: Page) {}

  /**
   * Mock successful registration
   */
  async mockSuccessfulRegistration(userData: any) {
    await this.page.route('**/api/auth/register', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user: userData,
          message: 'Registration successful'
        })
      });
    });
  }

  /**
   * Mock registration error
   */
  async mockRegistrationError(message: string, status = 400) {
    await this.page.route('**/api/auth/register', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message }
        })
      });
    });
  }

  /**
   * Mock network error
   */
  async mockNetworkError(url: string) {
    await this.page.route(url, async (route) => {
      await route.abort('failed');
    });
  }
}

export const testUsers = {
  owner: {
    id: '1',
    email: 'owner@example.com',
    fullName: 'Owner User',
    role: 'Owner',
    organizationId: 'org-1',
    hasEnabledTwoFactor: false,
  },
  manager: {
    id: '2',
    email: 'manager@example.com',
    fullName: 'Manager User',
    role: 'Manager',
    organizationId: 'org-1',
    hasEnabledTwoFactor: true,
  },
  member: {
    id: '3',
    email: 'member@example.com',
    fullName: 'Member User',
    role: 'Member',
    organizationId: 'org-1',
    hasEnabledTwoFactor: false,
  },
  viewer: {
    id: '4',
    email: 'viewer@example.com',
    fullName: 'Viewer User',
    role: 'Viewer',
    organizationId: 'org-1',
    hasEnabledTwoFactor: false,
  }
};