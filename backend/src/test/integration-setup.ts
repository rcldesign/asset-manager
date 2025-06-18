/**
 * Integration test setup with comprehensive cleanup
 * This ensures complete test isolation by cleaning all stateful components
 */

import { prisma } from '../lib/prisma';
import { redisClient } from '../lib/redis';
import { _test_only_resetFailedAttempts } from '../middleware/auth';

/**
 * Clear all data from the test database
 * Uses TRUNCATE with CASCADE to handle foreign key constraints
 */
async function clearDatabase() {
  try {
    const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter((name) => name !== '_prisma_migrations');

    for (const tablename of tables) {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "public"."${tablename}" RESTART IDENTITY CASCADE;`,
      );
    }
  } catch (error) {
    console.error('Error clearing database:', error);
    throw error;
  }
}

/**
 * Clear Redis data for test isolation
 */
async function clearRedis() {
  try {
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.flushdb();
    }
  } catch (error) {
    console.error('Error clearing Redis:', error);
    // Don't throw - Redis might not be required for all tests
  }
}

/**
 * Reset all in-memory state
 */
function resetInMemoryState() {
  // Reset rate limiter state
  _test_only_resetFailedAttempts();
}

// Hook into Jest lifecycle
beforeEach(async () => {
  await Promise.all([clearDatabase(), clearRedis()]);
  resetInMemoryState();
});

afterAll(async () => {
  try {
    await prisma.$disconnect();
    if (redisClient) {
      redisClient.disconnect();
    }
  } catch (error) {
    console.error('Error during teardown:', error);
  }
});
