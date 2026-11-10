import { createApp } from './app.js';
import { connectDatabase } from './db/connect.js';
import { env } from './config/env.js';

async function main() {
  try {
    await connectDatabase();
    console.log(`MongoDB connected: ${env.mongoUri}`);
  } catch (error) {
    console.error(`Could not connect to MongoDB at ${env.mongoUri}.`);
    console.error(error.message);
    console.error('Start mongod, set MONGODB_URI in server/.env, and run "npm run seed".');
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Stayora API listening on http://localhost:${env.port}/api`);
  });
}

main();
