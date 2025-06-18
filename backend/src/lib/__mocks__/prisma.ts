import type { DeepMockProxy } from 'jest-mock-extended';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';

// Create the mock with default behavior
export const prisma = mockDeep<PrismaClient>({
  fallbackMockImplementation: () => {
    throw new Error('Unmocked Prisma method called. Make sure to mock this method in your test.');
  },
}) as DeepMockProxy<PrismaClient>;

// Also set it as the global to prevent the real one from being created
if (typeof global !== 'undefined') {
  (global as typeof global & { prisma?: DeepMockProxy<PrismaClient> }).prisma = prisma;
}

// Export as default too to match the real module
export default prisma;
