/**
 * Global teardown for integration tests
 * This file ensures all resources are properly cleaned up after tests complete
 */

export default async function globalTeardown(): Promise<void> {
  console.log('\nRunning global test teardown...');

  // The intervals are now prevented from starting in test environment
  // so we don't need to stop them here
  
  // The other cleanup (Redis, Prisma, etc.) is handled by the afterAll hooks
  // in the integration-setup.ts file which runs in the test environment
  
  console.log('Global test teardown completed');
}