import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.{ts,tsx}',
    '**/*.(test|spec).{ts,tsx}',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**/*',
    '!src/**/__tests__/**/*',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/server.ts', // Main entry point, tested via integration
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['json-summary', 'text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/env-setup.ts', '<rootDir>/src/test/mock-setup.ts', '<rootDir>/src/test/setup.ts', '<rootDir>/src/test/prisma-singleton.ts'],
  testTimeout: 30000,
  detectOpenHandles: true,
  clearMocks: true,
  restoreMocks: true,
  testEnvironmentOptions: {
    customExportConditions: ['node'],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^openid-client$': '<rootDir>/__mocks__/openid-client.js',
    '^speakeasy$': '<rootDir>/__mocks__/speakeasy.js',
  },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/coverage/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(openid-client|oauth4webapi|jose)/)',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  verbose: true,
};

export default config;