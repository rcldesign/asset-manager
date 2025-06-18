import type { PrismaClient } from '@prisma/client';
import { mockReset, type DeepMockProxy } from 'jest-mock-extended';

// Tell Jest to use the manual mock
jest.mock('../lib/prisma');

// Import the mocked prisma
import { prisma } from '../lib/prisma';

// Export it as prismaMock with correct typing
export const prismaMock = prisma as DeepMockProxy<PrismaClient>;

// Reset the mock before each test to ensure test isolation.
beforeEach(() => {
  mockReset(prismaMock);
});

// Clear the global prisma to prevent caching issues
beforeAll(() => {
  if (global.prisma) {
    delete global.prisma;
  }
});
