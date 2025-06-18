#!/usr/bin/env node

/**
 * Check if PostgreSQL test database is available
 */

const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.test
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://testuser:testpass@localhost:5432/asset_manager_test?schema=public';

async function checkDatabase() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ PostgreSQL test database is available');
    await client.end();
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL test database is not available');
    console.error('Error:', error.message);
    console.log('\nTo run integration tests, you need a PostgreSQL database.');
    console.log('\nOption 1: Use Docker (recommended):');
    console.log('  docker run --name postgres-test -e POSTGRES_USER=testuser -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=asset_manager_test -p 5432:5432 -d postgres:15');
    console.log('\nOption 2: Use an existing PostgreSQL instance and create the test database:');
    console.log('  createdb -U testuser asset_manager_test');
    console.log('\nOption 3: Update .env.test with your PostgreSQL connection string');
    return false;
  }
}

if (require.main === module) {
  checkDatabase().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { checkDatabase };