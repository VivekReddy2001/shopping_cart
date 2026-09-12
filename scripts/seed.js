#!/usr/bin/env node
'use strict';

/**
 * Seeds the database with the demo catalogue, accounts and sample orders.
 *   npm run seed          → seeds only if the catalogue is empty
 *   npm run seed:reset    → wipes ALL data, then seeds from scratch
 */
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const { seedDatabase } = require('../src/seed/seedDatabase');
const config = require('../src/config/env');

async function main() {
  const reset = process.argv.includes('--reset');
  if (!config.mongoUri) {
    console.error(
      'MONGODB_URI is not set. Add it to .env (the in-memory database is only used by `npm run dev`).'
    );
    process.exit(1);
  }
  await connectDatabase();
  const result = await seedDatabase({ reset });
  console.log(reset ? 'Database reset and seeded:' : 'Seed complete:', result);
  if (config.seed.demoAccounts) {
    console.log(
      'Demo accounts: demo@example.com / Demo@1234  ·  demo.admin@example.com / Demo@1234 (read-only)'
    );
  }
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
