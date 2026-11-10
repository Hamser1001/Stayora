import { connectDatabase, disconnectDatabase } from '../src/db/connect.js';
import { seedDatabase, DEMO_PASSWORD } from '../src/db/seed.js';
import { env } from '../src/config/env.js';

async function main() {
  console.log(`Connecting to ${env.mongoUri}…`);
  await connectDatabase();
  const counts = await seedDatabase();
  console.table(counts);
  console.log(`\nDemo workspace ready. Sign in with amina@stayora.app / ${DEMO_PASSWORD}`);
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error('Seeding failed:', error.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
