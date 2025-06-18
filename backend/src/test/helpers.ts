import { PrismaClient } from '@prisma/client';
import type { Application } from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { generateTokens } from '../utils/auth';
import type { UserRole } from '@prisma/client';

// Re-export TOTP testing helpers
export * from './helpers/totp';

export interface TestUser {
  id: string;
  email: string;
  fullName?: string;
  role: UserRole;
  organizationId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: number;
  refreshTokenExpiry: number;
  tokenId: string;
}

export interface TestOrganization {
  id: string;
  name: string;
  ownerId: string | null;
}

/**
 * Test database helper for managing test data
 */
export class TestDatabaseHelper {
  private prisma: PrismaClient;

  constructor() {
    // Use the DATABASE_URL from environment, which should be set by .env.test
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            'postgresql://testuser:testpass@localhost:5432/asset_manager_test?schema=public',
        },
      },
    });
  }

  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async clearDatabase(): Promise<void> {
    // Clear in reverse dependency order
    await this.prisma.apiToken.deleteMany();
    await this.prisma.user.deleteMany();
    await this.prisma.organization.deleteMany();
  }

  async createTestOrganization(
    data: {
      name?: string;
      ownerId?: string;
    } = {},
  ): Promise<TestOrganization> {
    const organization = await this.prisma.organization.create({
      data: {
        name: data.name || `Test Org ${Date.now()}`,
        ownerUserId: data.ownerId || null,
      },
    });

    return {
      id: organization.id,
      name: organization.name,
      ownerId: organization.ownerUserId,
    };
  }

  async createTestUser(
    data: {
      email?: string;
      fullName?: string;
      role?: UserRole;
      organizationId?: string;
      password?: string;
      emailVerified?: boolean;
      totpEnabled?: boolean;
      isActive?: boolean;
    } = {},
  ): Promise<TestUser> {
    let organizationId = data.organizationId;

    // Create organization if not provided
    if (!organizationId) {
      const org = await this.createTestOrganization();
      organizationId = org.id;
    }

    // Hash password if provided
    let passwordHash = null;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    const user = await this.prisma.user.create({
      data: {
        email: data.email || `test-${Date.now()}@example.com`,
        fullName: data.fullName || 'Test User',
        role: data.role || 'MEMBER',
        organizationId,
        passwordHash,
        emailVerified: data.emailVerified ?? true,
        totpEnabled: data.totpEnabled ?? false,
        isActive: data.isActive ?? true,
      },
    });

    // Update organization owner if this user is an owner
    if (data.role === 'OWNER') {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { ownerUserId: user.id },
      });
    }

    // Generate JWT tokens for the test user
    const tokens = generateTokens({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName || undefined,
      role: user.role,
      organizationId: user.organizationId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiry: tokens.accessTokenExpiry,
      refreshTokenExpiry: tokens.refreshTokenExpiry,
      tokenId: tokens.tokenId,
    };
  }

  async createApiToken(
    userId: string,
    data: {
      name?: string;
      expiresAt?: Date;
    } = {},
  ): Promise<{ id: string; token: string; name: string }> {
    const apiTokenValue = randomBytes(32).toString('hex'); // Generate a secure, valid hex token
    const hashedToken = createHash('sha256').update(apiTokenValue).digest('hex'); // Use SHA-256 for consistent hashing
    const token = await this.prisma.apiToken.create({
      data: {
        name: data.name || `Test Token ${Date.now()}`,
        token: hashedToken, // Store SHA-256 hash
        userId,
        expiresAt: data.expiresAt,
      },
    });

    return {
      id: token.id,
      token: apiTokenValue, // Return raw token for use in tests
      name: token.name,
    };
  }

  getPrisma(): PrismaClient {
    return this.prisma;
  }
}

/**
 * Test API helper for making authenticated requests
 */
export class TestAPIHelper {
  public app: Application;
  public request: ReturnType<typeof request>;

  constructor(app: Application) {
    this.app = app;
    this.request = request(app);
  }

  /**
   * Make authenticated request with JWT token
   */
  authenticatedRequest(token: string) {
    return {
      get: (url: string) => request(this.app).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) => request(this.app).post(url).set('Authorization', `Bearer ${token}`),
      put: (url: string) => request(this.app).put(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) => request(this.app).patch(url).set('Authorization', `Bearer ${token}`),
      delete: (url: string) =>
        request(this.app).delete(url).set('Authorization', `Bearer ${token}`),
    };
  }

  /**
   * Make request with API token
   */
  apiTokenRequest(token: string) {
    return {
      get: (url: string) => request(this.app).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) => request(this.app).post(url).set('Authorization', `Bearer ${token}`),
      put: (url: string) => request(this.app).put(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) => request(this.app).patch(url).set('Authorization', `Bearer ${token}`),
      delete: (url: string) =>
        request(this.app).delete(url).set('Authorization', `Bearer ${token}`),
    };
  }
}

/**
 * Mock configuration for OIDC tests
 */
export const mockOIDCConfig = {
  issuerUrl: 'https://test-oidc-provider.example.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3001/api/oidc/callback',
};

/**
 * Generate mock OIDC user info
 */
export function generateMockOIDCUserInfo(overrides: any = {}) {
  return {
    sub: `oidc-user-${Date.now()}`,
    email: `oidc-user-${Date.now()}@example.com`,
    name: 'OIDC Test User',
    given_name: 'OIDC',
    family_name: 'User',
    email_verified: true,
    ...overrides,
  };
}

/**
 * Generate mock OIDC tokens
 */
export function generateMockOIDCTokens(overrides: any = {}) {
  return {
    access_token: `mock-access-token-${Date.now()}`,
    id_token: `mock-id-token-${Date.now()}`,
    refresh_token: `mock-refresh-token-${Date.now()}`,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid email profile',
    ...overrides,
  };
}

/**
 * Sleep utility for async tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate random test data
 */
export const testData = {
  email: () => `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
  password: () => 'TestPassword123!',
  organizationName: () => `Test Organization ${Date.now()}`,
  userName: () => `Test User ${Date.now()}`,
  tokenName: () => `Test Token ${Date.now()}`,
};

/**
 * Common test patterns
 */
export const expectValidationError = (response: request.Response, field?: string) => {
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('error');
  if (field) {
    expect(response.body.error).toContain(field);
  }
};

export const expectAuthenticationError = (response: request.Response) => {
  expect(response.status).toBe(401);
  expect(response.body).toHaveProperty('error');
};

export const expectAuthorizationError = (response: request.Response) => {
  expect(response.status).toBe(403);
  expect(response.body).toHaveProperty('error');
};

export const expectNotFoundError = (response: request.Response) => {
  expect(response.status).toBe(404);
  expect(response.body).toHaveProperty('error');
};

export const expectSuccessfulResponse = (response: request.Response, statusCode = 200) => {
  expect(response.status).toBe(statusCode);
  expect(response.body).not.toHaveProperty('error');
};

/**
 * TOTP Integration Testing Helpers
 *
 * These helpers provide controlled-time TOTP testing for integration tests
 * instead of mocking speakeasy.totp.verify to always return true.
 */

import { UserService } from '../services/user.service';
import {
  TEST_TOTP_SECRET,
  MOCK_TIME_EPOCH_SECONDS,
  generateValidTOTPToken,
  generateExpiredTOTPToken,
} from './helpers/totp';

/**
 * Test-enabled UserService that accepts time parameters for TOTP verification
 * This allows us to test actual TOTP logic with controlled time.
 */
export class TestUserService extends UserService {
  /**
   * Authenticate user with controlled time for TOTP testing
   */
  async authenticateUserWithTime(
    email: string,
    password: string,
    totpToken?: string,
    timeForTesting?: number,
  ) {
    return super.authenticateUser(email, password, totpToken, timeForTesting);
  }

  /**
   * Enable 2FA with controlled time for TOTP testing
   */
  async enableTwoFactorWithTime(userId: string, totpToken: string, timeForTesting?: number) {
    return super.enableTwoFactor(userId, totpToken, timeForTesting);
  }

  /**
   * Disable 2FA with controlled time for TOTP testing
   */
  async disableTwoFactorWithTime(userId: string, totpToken: string, timeForTesting?: number) {
    return super.disableTwoFactor(userId, totpToken, timeForTesting);
  }
}

/**
 * Generate a valid TOTP token for the test secret and current mock time
 */
export function generateTestTOTPToken(time: number = MOCK_TIME_EPOCH_SECONDS): string {
  return generateValidTOTPToken(TEST_TOTP_SECRET, time);
}

/**
 * Generate a valid TOTP token for the test secret and current system time
 * Use this for integration tests where real-time verification is used
 */
export function generateCurrentTestTOTPToken(): string {
  const currentTimeSeconds = Math.floor(Date.now() / 1000);
  return generateValidTOTPToken(TEST_TOTP_SECRET, currentTimeSeconds);
}

/**
 * Generate an expired TOTP token for the test secret
 */
export function generateExpiredTestTOTPToken(time: number = MOCK_TIME_EPOCH_SECONDS): string {
  return generateExpiredTOTPToken(TEST_TOTP_SECRET, time);
}
