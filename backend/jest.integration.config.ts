import baseConfig from './jest.config';

export default {
  ...baseConfig,
  displayName: 'integration',
  testMatch: ['<rootDir>/src/test/integration/**/*.test.ts', '<rootDir>/src/test/e2e/**/*.test.ts'],
  globalSetup: '<rootDir>/src/test/integration/global-setup.ts',
  // Override setup files to exclude prisma-singleton mock for integration tests
  setupFilesAfterEnv: [
    '<rootDir>/src/test/integration/jest-setup.ts',
    '<rootDir>/src/test/setup.ts'
  ],
  // Override moduleNameMapper to ensure real modules are used
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Only mock modules that need special handling for integration tests
    '^openid-client$': '<rootDir>/__mocks__/openid-client.js',
    '^speakeasy$': '<rootDir>/__mocks__/speakeasy.js',
  },
  // Run tests serially to help identify state pollution
  maxWorkers: 1,
};