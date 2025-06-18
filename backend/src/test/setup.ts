/**
 * Jest global test setup file
 * This file runs after the test framework is set up but before each test file
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-long';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key-for-testing';
process.env.SESSION_SECRET = 'test-session-secret-32-characters-long';
process.env.DISABLE_RATE_LIMITING = 'true';

// Database setup for tests
// Use PostgreSQL format to match production configuration
process.env.DATABASE_URL =
  'postgresql://testuser:testpass@localhost:5432/asset_manager_test?schema=public';
process.env.USE_EMBEDDED_DB = 'false'; // Use test database

// Redis setup for tests
process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use test DB 1
process.env.USE_EMBEDDED_REDIS = 'false';

// Disable OIDC for most tests
process.env.OIDC_ISSUER_URL = '';
process.env.OIDC_CLIENT_ID = '';
process.env.OIDC_CLIENT_SECRET = '';
process.env.OIDC_REDIRECT_URI = '';

// Set logging to minimal for tests
process.env.LOG_LEVEL = 'error';

// Disable metrics for tests
process.env.ENABLE_METRICS = 'false';

// Extend Jest matchers
import '@jest/globals';
import { disconnectRedis } from '../lib/redis';
import { _test_only_stopCleanupInterval } from '../middleware/auth';
import { _test_only_stopOidcCleanupInterval } from '../routes/oidc';

// Global test timeout for async operations
jest.setTimeout(10000);

// Setup global mocks
beforeAll(() => {
  // Mock console methods to reduce noise in tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  // Only allow console.error to show critical issues
  const originalError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    // Only show errors that aren't expected test failures
    if (!args[0]?.toString().includes('Jest worker')) {
      originalError(...args);
    }
  });
});

afterAll(async () => {
  // Restore console methods
  jest.restoreAllMocks();

  // Stop all known timers
  _test_only_stopCleanupInterval();
  _test_only_stopOidcCleanupInterval();

  // Disconnect the global Redis client
  await disconnectRedis();
});

// Global error handler for unhandled promises in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  throw reason;
});

export {};
