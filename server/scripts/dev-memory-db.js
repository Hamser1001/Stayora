/**
 * Local, throwaway MongoDB used for verification when the Atlas cluster is
 * unreachable from the current network. Not part of the application runtime.
 */
import fs from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

const server = await MongoMemoryServer.create({
  instance: { port: 27018, dbName: 'stayora' },
});

fs.writeFileSync('/tmp/stayora-memory-uri', server.getUri());
console.log(`Memory MongoDB ready: ${server.getUri()}`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
