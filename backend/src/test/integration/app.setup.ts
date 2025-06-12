import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';

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

import authRoutes from '../../routes/auth';
import userRoutes from '../../routes/users';
import organizationRoutes from '../../routes/organizations';
import oidcRoutes from '../../routes/oidc';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler';
import { TestDatabaseHelper } from '../helpers';

/**
 * Create test application with all routes and middleware
 */
export function createTestApp(): Application {
  const app = express();

  // Basic middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/organizations', organizationRoutes);
  app.use('/api/oidc', oidcRoutes);

  // 404 handler for undefined routes
  app.use(notFoundHandler);

  // Error handling
  app.use(errorHandler);

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
 * Setup test environment variables for integration tests
 */
export function setupTestEnvironment(): void {
  // Ensure test environment
  process.env.NODE_ENV = 'test';

  // Database configuration
  process.env.DATABASE_URL = 'file:./test.db';
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

  // File upload configuration
  process.env.UPLOAD_DIR = './test-uploads';
  process.env.MAX_FILE_SIZE = '10485760'; // 10MB
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
