/**
 * Mock setup that runs before module imports
 * This ensures mocks are in place before any code imports the real modules
 * Only applies to unit tests, not integration tests
 */

// Only mock in unit tests, not integration tests
const isIntegrationTest =
  process.env.JEST_WORKER_ID &&
  (__filename.includes('/integration/') || __filename.includes('/e2e/'));

if (!isIntegrationTest) {
  // Mock queue module to prevent Redis connections
  jest.mock('../lib/queue', () => require('./__mocks__/queue'));

  // Mock redis module to prevent Redis connections in tests
  jest.mock('../lib/redis', () => require('./__mocks__/redis'));
}

// Disable console logs in tests unless they're errors
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  // Keep error to see actual problems
  error: console.error,
};

export {};
