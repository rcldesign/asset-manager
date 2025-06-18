/**
 * Conditional test runner for integration tests that require a database
 */

import { describe } from '@jest/globals';
import { checkDatabaseAvailability } from './skip-if-no-db';

let dbAvailable: boolean | null = null;

async function isDatabaseAvailable(): Promise<boolean> {
  if (dbAvailable === null) {
    dbAvailable = await checkDatabaseAvailability();
  }
  return dbAvailable;
}

export const describeIfDb = (name: string, fn: () => void) => {
  // Check database synchronously by using the cached result
  void isDatabaseAvailable().then((available) => {
    if (!available) {
      describe.skip(name, fn);
    } else {
      describe(name, fn);
    }
  });
};

// For immediate use, we'll use a synchronous check based on environment
const isCI = process.env.CI === 'true';
const skipDb = process.env.SKIP_DB_TESTS === 'true';

export const describeWithDb = (name: string, fn: () => void): void => {
  if (isCI || skipDb) {
    describe.skip(name, fn);
  } else {
    describe(name, fn);
  }
};
