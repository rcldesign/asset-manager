/**
 * Skip integration tests if PostgreSQL is not available
 */

import { Client } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://testuser:testpass@localhost:5432/asset_manager_test?schema=public';

let isDatabaseAvailable: boolean | null = null;

export async function checkDatabaseAvailability(): Promise<boolean> {
  if (isDatabaseAvailable !== null) {
    return isDatabaseAvailable;
  }

  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    await client.end();
    isDatabaseAvailable = true;
    return true;
  } catch {
    isDatabaseAvailable = false;
    console.warn('⚠️  PostgreSQL is not available - integration tests will fail');
    console.warn(
      '   Run: docker run --name postgres-test -e POSTGRES_USER=testuser -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=asset_manager_test -p 5432:5432 -d postgres:15',
    );
    return false;
  }
}

export async function skipIfNoDatabase(): Promise<boolean> {
  const isAvailable = await checkDatabaseAvailability();

  if (!isAvailable) {
    throw new Error('PostgreSQL database is not available. Please start the test database first.');
  }

  return isAvailable;
}
