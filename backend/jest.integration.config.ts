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
  // Run tests serially to help identify state pollution
  maxWorkers: 1,
};