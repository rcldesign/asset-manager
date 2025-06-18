/**
 * Environment setup specifically for unit tests
 * Overrides database settings to prevent real database connections
 */

import { jest } from '@jest/globals';

// Mock external dependencies before any code imports them
jest.mock('bcrypt');
jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    createHash: jest.fn(() => ({
      update: jest.fn(() => ({
        digest: jest.fn(() => 'sha256-hash'),
      })),
    })),
    // Keep randomBytes real for auth tests
    randomBytes: actual.randomBytes,
  };
});
jest.mock('jsonwebtoken');
jest.mock('qrcode');

// Mock security middleware functions
jest.mock('../middleware/security', () => ({
  validateJWTStructure: jest.fn(() => true),
  rateLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
  helmetConfig: jest.fn(),
}));

// Note: Permission manager mock removed from global setup
// Individual tests should mock it locally if needed

// Set test environment
process.env.NODE_ENV = 'test';

// Override database URL to prevent real connections
// This will make Prisma fail if it tries to connect
process.env.DATABASE_URL = 'postgresql://mock:mock@mock:5432/mock';

// Ensure embedded DB is disabled
process.env.USE_EMBEDDED_DB = 'false';

// Other test environment variables
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-long';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key-for-testing';
process.env.SESSION_SECRET = 'test-session-secret-32-characters-long';
process.env.DISABLE_RATE_LIMITING = 'true';
process.env.LOG_LEVEL = 'error';
process.env.ENABLE_METRICS = 'false';

// Redis setup for tests (mocked, so doesn't matter)
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.USE_EMBEDDED_REDIS = 'false';

// Disable OIDC for tests
process.env.OIDC_ISSUER_URL = '';
process.env.OIDC_CLIENT_ID = '';
process.env.OIDC_CLIENT_SECRET = '';
process.env.OIDC_REDIRECT_URI = '';

// CORS - Allow localhost for tests
process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3001';

export {};
