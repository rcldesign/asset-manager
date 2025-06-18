import baseConfig from './jest.config';

export default {
  ...baseConfig,
  displayName: 'unit',
  testMatch: ['<rootDir>/src/test/unit/**/*.test.ts'],
  // For unit tests, use unit-specific env setup and include the prisma mock
  setupFilesAfterEnv: [
    '<rootDir>/src/test/unit-env-setup.ts',  // Unit test specific env
    '<rootDir>/src/test/prisma-singleton.ts', // Mock setup BEFORE general setup
    '<rootDir>/src/test/setup.ts'
  ],
  // Add mocks for unit tests only
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^jsonwebtoken$': '<rootDir>/__mocks__/jsonwebtoken.js',
    '^qrcode$': '<rootDir>/__mocks__/qrcode.js',
  },
};