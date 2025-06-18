import { checkDatabaseAvailability } from './skip-if-no-db';

export default async function globalSetup() {
  const dbAvailable = await checkDatabaseAvailability();

  if (!dbAvailable) {
    console.error('\n❌ PostgreSQL database is not available!');
    console.error('Integration tests require a running PostgreSQL database.\n');
    console.error('To start the test database, run:');
    console.error('  npm run test:db:start\n');
    console.error('Or use an existing PostgreSQL instance and update .env.test\n');
    process.exit(1);
  }

  console.log('✅ PostgreSQL database is available for integration tests');
}
