import { type Application } from 'express';

// We no longer use jest.mock for speakeasy - instead we use jest.spyOn in individual tests
// This avoids the complexity of mocking functions that have both callable and property aspects

// Mock OIDC service before importing routes
jest.mock('../../services/oidc.service', () => ({
  OIDCService: {
    getInstance: jest.fn().mockReturnValue({
      getAuthorizationUrl: jest.fn().mockResolvedValue('https://mock-auth-url.com'),
      exchangeCodeForTokens: jest.fn().mockResolvedValue({
        access_token: 'mock-access-token',
        id_token: 'mock-id-token',
      }),
      getUserInfo: jest.fn().mockResolvedValue({
        sub: 'mock-user-id',
        email: 'mock@example.com',
        name: 'Mock User',
      }),
    }),
  },
}));

import app from '../../app';
import { TestDatabaseHelper } from '../helpers';

/**
 * Create test application with all routes and middleware
 */
export function createTestApp(): Application {
  // Simply return the main app which already has all middleware and routes configured
  return app;
}

/**
 * Setup test database for integration tests
 */
export async function setupTestDatabase(): Promise<TestDatabaseHelper> {
  const dbHelper = new TestDatabaseHelper();

  await dbHelper.connect();
  await dbHelper.clearDatabase();

  return dbHelper;
}

/**
 * Cleanup test database
 */
export async function cleanupTestDatabase(dbHelper: TestDatabaseHelper): Promise<void> {
  await dbHelper.clearDatabase();
  await dbHelper.disconnect();
}

/**
 * Get test user and organization for integration tests
 */
export async function getTestUser(dbHelper: TestDatabaseHelper, organizationId?: string) {
  const user = await dbHelper.createTestUser({
    organizationId,
    email: `test-${Date.now()}@example.com`,
    password: 'password123',
    role: 'MEMBER',
  });

  // Return the full user object from database
  return await dbHelper.getPrisma().user.findUniqueOrThrow({
    where: { id: user.id },
  });
}

export async function getTestOrganization(dbHelper: TestDatabaseHelper) {
  const org = await dbHelper.createTestOrganization();
  return await dbHelper.getPrisma().organization.findUniqueOrThrow({
    where: { id: org.id },
  });
}

/**
 * Setup test environment variables for integration tests
 */
export function setupTestEnvironment(): void {
  // Ensure test environment
  process.env.NODE_ENV = 'test';

  // Database configuration - use PostgreSQL from .env.test
  // Don't override DATABASE_URL here - it should come from .env.test
  process.env.USE_EMBEDDED_DB = 'false';

  // JWT secrets
  process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-long';
  process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key-for-testing';
  process.env.SESSION_SECRET = 'test-session-secret-32-characters-long';

  // Redis configuration
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.USE_EMBEDDED_REDIS = 'false';

  // Disable OIDC for most tests
  process.env.OIDC_ISSUER_URL = '';
  process.env.OIDC_CLIENT_ID = '';
  process.env.OIDC_CLIENT_SECRET = '';
  process.env.OIDC_REDIRECT_URI = '';

  // Logging configuration
  process.env.LOG_LEVEL = 'error';
  process.env.ENABLE_METRICS = 'false';

  // Disable workers during tests
  process.env.DISABLE_WORKERS = 'true';

  // File upload configuration
  process.env.UPLOAD_DIR = './test-uploads';
  process.env.MAX_FILE_SIZE = '10485760'; // 10MB

  // Disable rate limiting in tests
  process.env.DISABLE_RATE_LIMITING = 'true';
}

/**
 * Common test data generators
 */
export const testDataGenerators = {
  validUser: () => ({
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    fullName: 'Test User',
    organizationName: `Test Organization ${Date.now()}`,
  }),

  validOrganization: () => ({
    name: `Test Organization ${Date.now()}`,
  }),

  validLogin: (email: string) => ({
    email,
    password: 'TestPassword123!',
  }),

  validPasswordChange: () => ({
    currentPassword: 'TestPassword123!',
    newPassword: 'NewTestPassword456!',
  }),

  validApiToken: () => ({
    name: `Test Token ${Date.now()}`,
  }),

  // Phase 2 generators using TestDatabaseHelper
  organization: async (
    dbHelper: TestDatabaseHelper,
    data: Partial<{ name: string; ownerId: string }> = {},
  ) => {
    const result = await dbHelper.createTestOrganization(data);
    return await dbHelper.getPrisma().organization.findUniqueOrThrow({
      where: { id: result.id },
    });
  },

  user: async (
    dbHelper: TestDatabaseHelper,
    data: Partial<{
      email: string;
      fullName: string;
      role: 'OWNER' | 'MANAGER' | 'MEMBER';
      organizationId: string;
      password: string;
      emailVerified: boolean;
      totpEnabled: boolean;
      isActive: boolean;
    }> = {},
  ) => {
    const testUser = await dbHelper.createTestUser(data);
    return await dbHelper.getPrisma().user.findUniqueOrThrow({
      where: { id: testUser.id },
    });
  },

  location: async (
    dbHelper: TestDatabaseHelper,
    data: {
      organizationId: string;
      name: string;
      path: string;
      description?: string;
      parentId?: string;
    },
  ) => {
    return await dbHelper.getPrisma().location.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        path: data.path,
        description: data.description,
        parentId: data.parentId,
      },
    });
  },

  assetTemplate: async (
    dbHelper: TestDatabaseHelper,
    data: {
      organizationId: string;
      name: string;
      category:
        | 'HARDWARE'
        | 'SOFTWARE'
        | 'FURNITURE'
        | 'VEHICLE'
        | 'EQUIPMENT'
        | 'PROPERTY'
        | 'OTHER';
      description?: string;
      defaultFields?: Record<string, unknown>;
    },
  ) => {
    return await dbHelper.getPrisma().assetTemplate.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        category: data.category,
        description: data.description,
        defaultFields: data.defaultFields as any,
      },
    });
  },

  asset: async (
    dbHelper: TestDatabaseHelper,
    data: {
      organizationId: string;
      locationId: string;
      name: string;
      category:
        | 'HARDWARE'
        | 'SOFTWARE'
        | 'FURNITURE'
        | 'VEHICLE'
        | 'EQUIPMENT'
        | 'PROPERTY'
        | 'OTHER';
      status?: 'OPERATIONAL' | 'MAINTENANCE' | 'REPAIR' | 'RETIRED' | 'DISPOSED' | 'LOST';
      description?: string;
      serialNumber?: string;
      modelNumber?: string;
      manufacturer?: string;
      purchaseDate?: Date;
      purchasePrice?: number;
      warrantyExpiry?: Date;
      assetTemplateId?: string;
      parentId?: string;
      path?: string;
      customFields?: Record<string, unknown>;
      tags?: string[];
      qrCode?: string;
      link?: string;
    },
  ) => {
    return await dbHelper.getPrisma().asset.create({
      data: {
        organizationId: data.organizationId,
        locationId: data.locationId,
        name: data.name,
        category: data.category,
        status: data.status || 'OPERATIONAL',
        description: data.description,
        serialNumber: data.serialNumber,
        modelNumber: data.modelNumber,
        manufacturer: data.manufacturer,
        purchaseDate: data.purchaseDate,
        purchasePrice: data.purchasePrice,
        warrantyExpiry: data.warrantyExpiry,
        assetTemplateId: data.assetTemplateId,
        parentId: data.parentId,
        path: data.path || `/asset-${Date.now()}`,
        customFields: data.customFields as any,
        tags: data.tags || [],
        qrCode: data.qrCode,
        link: data.link,
      },
    });
  },
};

/**
 * Common assertion helpers for integration tests
 */
export const integrationAssertions = {
  expectValidUser: (user: any) => {
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('role');
    expect(user).toHaveProperty('organizationId');
    expect(user).toHaveProperty('emailVerified');
    expect(user).toHaveProperty('totpEnabled');
    expect(user).toHaveProperty('notificationPreferences');
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('totpSecret');
  },

  expectValidOrganization: (organization: any) => {
    expect(organization).toHaveProperty('id');
    expect(organization).toHaveProperty('name');
    expect(organization).toHaveProperty('createdAt');
    expect(organization).toHaveProperty('updatedAt');
  },

  expectValidTokens: (tokens: any) => {
    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
    expect(tokens).toHaveProperty('accessTokenExpiry');
    expect(tokens).toHaveProperty('refreshTokenExpiry');
    expect(tokens).toHaveProperty('tokenId');
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');
    expect(typeof tokens.accessTokenExpiry).toBe('number');
    expect(typeof tokens.refreshTokenExpiry).toBe('number');
    expect(typeof tokens.tokenId).toBe('string');
    expect(tokens.accessToken.length).toBeGreaterThan(10);
    expect(tokens.refreshToken.length).toBeGreaterThan(10);
    expect(tokens.tokenId.length).toBeGreaterThan(10);
  },

  expectValidApiToken: (apiToken: any) => {
    expect(apiToken).toHaveProperty('id');
    expect(apiToken).toHaveProperty('name');
    expect(apiToken).toHaveProperty('token');
    expect(apiToken).toHaveProperty('createdAt');
    expect(typeof apiToken.token).toBe('string');
    expect(apiToken.token.length).toBeGreaterThan(10);
  },

  expectErrorResponse: (response: any, statusCode: number) => {
    expect(response.status).toBe(statusCode);
    expect(response.body).toHaveProperty('error');
    expect(typeof response.body.error).toBe('string');
  },

  expectSuccessResponse: (response: any, statusCode: number = 200) => {
    expect(response.status).toBe(statusCode);
    expect(response.body).not.toHaveProperty('error');
  },
};

// Re-export TestDatabaseHelper for convenience
export { TestDatabaseHelper } from '../helpers';
