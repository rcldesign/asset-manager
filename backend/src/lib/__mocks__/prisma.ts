import { jest } from '@jest/globals';

// Create a comprehensive manual mock that matches Prisma's structure
const createMockPrismaModel = () => ({
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  upsert: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
  groupBy: jest.fn(),
  createMany: jest.fn(),
  updateMany: jest.fn(),
  deleteMany: jest.fn(),
});

// Create mock for all models needed
export const prisma = {
  user: createMockPrismaModel(),
  organization: createMockPrismaModel(),
  asset: createMockPrismaModel(),
  location: createMockPrismaModel(),
  task: createMockPrismaModel(),
  schedule: createMockPrismaModel(),
  apiToken: createMockPrismaModel(),
  session: createMockPrismaModel(),
  auditTrail: createMockPrismaModel(),
  webhookSubscription: createMockPrismaModel(),
  calendarIntegration: createMockPrismaModel(),
  syncClient: createMockPrismaModel(),
  syncQueue: createMockPrismaModel(),
  syncMetadata: createMockPrismaModel(),
  syncConflict: createMockPrismaModel(),
  reportHistory: createMockPrismaModel(),
  scheduledReport: createMockPrismaModel(),
  component: createMockPrismaModel(),
  taskAssignment: createMockPrismaModel(),
  attachment: createMockPrismaModel(),
  activityStream: createMockPrismaModel(),
  webhookDelivery: createMockPrismaModel(),
  taskComment: createMockPrismaModel(),
  assetTemplate: createMockPrismaModel(),
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// Export as default too to match the real module
export default prisma;
