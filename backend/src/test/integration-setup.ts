/**
 * Integration test setup with comprehensive cleanup
 * This ensures complete test isolation by cleaning all stateful components
 */

import { prisma } from '../lib/prisma';
import { disconnectRedis } from '../lib/redis';
import { closeQueues } from '../lib/queue';
import { _test_only_resetFailedAttempts } from '../middleware/auth';
import { _test_only_stopCleanupInterval } from '../middleware/auth';
import { _test_only_stopOidcCleanupInterval } from '../routes/oidc';

// Removed clearDatabase and clearRedis functions
// Integration tests should manage their own data cleanup

/**
 * Reset all in-memory state
 */
function resetInMemoryState() {
  // Reset rate limiter state
  _test_only_resetFailedAttempts();
}

// Hook into Jest lifecycle
// Don't clear database globally - let each test manage its own data
beforeEach(() => {
  // Only reset in-memory state between tests
  resetInMemoryState();
});

afterAll(async () => {
  try {
    // Stop cleanup intervals
    _test_only_stopCleanupInterval();
    _test_only_stopOidcCleanupInterval();
    
    // Close all queues and their connections
    await closeQueues();
    
    // Disconnect Redis
    await disconnectRedis();
    
    // Disconnect Prisma
    await prisma.$disconnect();
    
    // Give connections time to fully close
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    console.error('Error during teardown:', error);
  }
}, 30000);
