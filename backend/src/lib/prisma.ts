import { PrismaClient } from '@prisma/client';
import { syncMiddleware } from './prisma-sync-middleware';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  // Register sync middleware only if not in test environment
  if (process.env.NODE_ENV !== 'test') {
    client.$use(syncMiddleware);
  }

  return client;
}

export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
