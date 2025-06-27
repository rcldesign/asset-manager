/**
 * Test cleanup helpers
 * These functions help ensure all resources are properly cleaned up after tests
 */

let authCleanupInterval: NodeJS.Timeout | undefined;
let oidcCleanupInterval: NodeJS.Timeout | undefined;

/**
 * Register an auth cleanup interval for later cleanup
 */
export function registerAuthCleanupInterval(interval: NodeJS.Timeout): void {
  authCleanupInterval = interval;
}

/**
 * Register an OIDC cleanup interval for later cleanup
 */
export function registerOidcCleanupInterval(interval: NodeJS.Timeout): void {
  oidcCleanupInterval = interval;
}

/**
 * Stop all registered intervals
 */
export function stopAllIntervals(): void {
  if (authCleanupInterval) {
    clearInterval(authCleanupInterval);
    authCleanupInterval = undefined;
  }
  if (oidcCleanupInterval) {
    clearInterval(oidcCleanupInterval);
    oidcCleanupInterval = undefined;
  }
}

/**
 * Check if we're in a test environment
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}
