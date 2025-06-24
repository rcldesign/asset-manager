/**
 * Queue cleanup helper for tests
 * Ensures all queue connections are properly closed after tests
 */

import { closeQueues } from '../../lib/queue';
import { disconnectRedis } from '../../lib/redis';
import { logger } from '../../utils/logger';

// Track if cleanup has been registered
let cleanupRegistered = false;

/**
 * Register queue cleanup for tests
 * Should be called in test setup to ensure queues are closed after all tests
 */
export function registerQueueCleanup(): void {
  if (cleanupRegistered) {
    return;
  }

  cleanupRegistered = true;

  // Add global afterAll handler for queue cleanup
  if (typeof afterAll !== 'undefined') {
    afterAll(async () => {
      try {
        // First, wait for any pending jobs to complete
        await waitForQueueJobs(3000);
        
        // Close all queues and their connections
        await closeQueues();
        
        // Disconnect the main Redis client
        await disconnectRedis();
        
        // Give connections time to fully close
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        logger.debug('Queue cleanup completed');
      } catch (error) {
        logger.error('Error during queue cleanup:', error);
      }
    }, 30000); // Increase timeout for cleanup
  }
}

/**
 * Clear all jobs from queues (useful for test isolation)
 */
export async function clearAllQueues(): Promise<void> {
  try {
    const { queues } = await import('../../lib/queue');
    
    await Promise.all([
      queues.email.obliterate({ force: true }),
      queues.notifications.obliterate({ force: true }),
      queues.maintenance.obliterate({ force: true }),
      queues.reports.obliterate({ force: true }),
      queues.schedules.obliterate({ force: true }),
    ]);
    
    logger.debug('All queues cleared');
  } catch (error) {
    logger.error('Error clearing queues:', error);
  }
}

/**
 * Wait for all queue jobs to complete
 */
export async function waitForQueueJobs(timeout = 5000): Promise<void> {
  const { queues } = await import('../../lib/queue');
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const allQueues = Object.values(queues);
    const jobCounts = await Promise.all(
      allQueues.map(async (queue) => {
        const [active, waiting] = await Promise.all([
          queue.getActiveCount(),
          queue.getWaitingCount(),
        ]);
        return active + waiting;
      })
    );
    
    const totalJobs = jobCounts.reduce((sum, count) => sum + count, 0);
    
    if (totalJobs === 0) {
      return;
    }
    
    // Wait a bit before checking again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  
  logger.warn('Timeout waiting for queue jobs to complete');
}