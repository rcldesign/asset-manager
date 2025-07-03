import type { PrismaClient } from '@prisma/client';
import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { jest } from '@jest/globals';

// Mock prisma to return our jest-mock-extended instance
jest.mock('../lib/prisma', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

// Import the mocked prisma
import { prisma } from '../lib/prisma';

// Export it as prismaMock with correct typing
export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

// Clear the mock before each test to ensure test isolation.
beforeEach(() => {
  // Clear all jest mock functions on the prismaMock
  jest.clearAllMocks();
});

// Clear the global prisma to prevent caching issues
beforeAll(() => {
  if (global.prisma) {
    delete global.prisma;
  }
});
