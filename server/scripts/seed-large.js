import { connectDatabase, disconnectDatabase } from '../src/db/connect.js';
import { seedLargeDatabase } from '../src/db/seedLarge.js';
import { env } from '../src/config/env.js';

async function main() {
  console.log(`Connecting to ${env.mongoUri}…`);
  await connectDatabase();
  const started = Date.now();
  const counts = await seedLargeDatabase({ log: (message) => console.log(message) });
  console.table(counts);
  console.log(`\nSeeded ${counts.total} documents in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  console.log('Demo login: hamza@stayora.app / stayora2026');
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error('Large seeding failed:', error.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
