import { PrismaClient } from '@prisma/client';
import { Application } from 'express';
import request from 'supertest';
import { generateTokens } from '../utils/auth';
import type { UserRole } from '@prisma/client';

export interface TestUser {
  id: string;
  email: string;
  fullName?: string;
  role: UserRole;
  organizationId: string;
  accessToken: string;
  refreshToken: string;
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
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'file:./test.db',
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

  async createTestOrganization(data: {
    name?: string;
    ownerId?: string;
  } = {}): Promise<TestOrganization> {
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

  async createTestUser(data: {
    email?: string;
    fullName?: string;
    role?: UserRole;
    organizationId?: string;
    password?: string;
    emailVerified?: boolean;
    totpEnabled?: boolean;
    isActive?: boolean;
  } = {}): Promise<TestUser> {
    let organizationId = data.organizationId;

    // Create organization if not provided
    if (!organizationId) {
      const org = await this.createTestOrganization();
      organizationId = org.id;
    }

    const user = await this.prisma.user.create({
      data: {
        email: data.email || `test-${Date.now()}@example.com`,
        fullName: data.fullName || 'Test User',
        role: data.role || 'MEMBER',
        organizationId,
        passwordHash: data.password || null, // In real tests, this would be hashed
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
    };
  }

  async createApiToken(userId: string, data: {
    name?: string;
    expiresAt?: Date;
  } = {}): Promise<{ id: string; token: string; name: string }> {
    const token = await this.prisma.apiToken.create({
      data: {
        name: data.name || `Test Token ${Date.now()}`,
        token: `test-token-${Date.now()}`,
        userId,
        expiresAt: data.expiresAt,
      },
    });

    return {
      id: token.id,
      token: token.token,
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
  public request: request.SuperTest<request.Test>;

  constructor(app: Application) {
    this.request = request(app);
  }

  /**
   * Make authenticated request with JWT token
   */
  authenticatedRequest(token: string): request.Test {
    return this.request.get('').set('Authorization', `Bearer ${token}`);
  }

  /**
   * Make request with API token
   */
  apiTokenRequest(token: string): request.Test {
    return this.request.get('').set('Authorization', `Bearer ${token}`);
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
  return new Promise(resolve => setTimeout(resolve, ms));
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