#!/usr/bin/env node
/**
 * Local dev stack in one command (`npm run dev` from the repo root).
 *
 * Starts, in order:
 *   1. MongoDB on 127.0.0.1:27018, keeping its files in .data/mongodb so every
 *      change survives a restart (skipped if the port is busy),
 *   2. the demo seed, only when the database has no tasks yet,
 *   3. the Express API on 127.0.0.1:4000,
 *   4. the Vite client on 127.0.0.1:5173.
 *
 * Every part runs until you press Ctrl+C, so the client can no longer outlive
 * the API and surface "Network error" toasts. Anything already listening on a
 * port is reused instead of being started twice.
 *
 * Run it from a WSL shell in the project folder: the installed dependencies
 * (rollup/esbuild/mongod) are Linux builds, and npm cannot run from a Windows
 * UNC path such as \\wsl.localhost\...
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(rootDir, 'server');
const clientDir = path.join(rootDir, 'client');

const API_PORT = Number(process.env.API_PORT) || 4000;
const CLIENT_PORT = Number(process.env.CLIENT_PORT) || 5173;
const MONGO_PORT = Number(process.env.MONGO_PORT) || 27018;
const MONGO_DB = process.env.MONGO_DB || 'stayora';
// On-disk database: stopping the stack must never discard user data.
const MONGO_DATA_DIR = process.env.MONGO_DATA_DIR || path.join(rootDir, '.data', 'mongodb');

const mongoUri = `mongodb://127.0.0.1:${MONGO_PORT}/${MONGO_DB}`;
const apiOrigin = `http://127.0.0.1:${API_PORT}`;
const clientOrigin = `http://localhost:${CLIENT_PORT}`;

const children = [];
let memoryServer = null;
let shuttingDown = false;

function log(scope, message) {
  console.log(`[${scope}] ${message}`);
}


function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const settle = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(700);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

async function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function waitForHttp(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function pipeOutput(child, scope) {
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) log(scope, line);
      }
    });
  }
}

function startProcess(scope, command, args, options) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  children.push({ scope, child });
  pipeOutput(child, scope);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    log(scope, `exited (${signal || `code ${code}`})`);
    shutdown(code ?? 1);
  });
  return child;
}

async function runOnce(scope, args, options) {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  pipeOutput(child, scope);
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${scope} exited with code ${code}`))));
  });
}

async function startMongo() {
  if (await isPortOpen(MONGO_PORT)) {
    log('mongo', `reusing the MongoDB already listening on ${mongoUri}`);
    return;
  }
  try {
    fs.mkdirSync(MONGO_DATA_DIR, { recursive: true });
    memoryServer = await MongoMemoryServer.create({
      instance: { port: MONGO_PORT, dbName: MONGO_DB, dbPath: MONGO_DATA_DIR },
    });
    log('mongo', `MongoDB ready at ${mongoUri} (data kept in ${MONGO_DATA_DIR})`);
  } catch (error) {
    await memoryServer?.stop().catch(() => {});
    memoryServer = null;
    log('mongo', `could not use ${MONGO_DATA_DIR} (${error.message})`);
    memoryServer = await MongoMemoryServer.create({
      instance: { port: MONGO_PORT, dbName: MONGO_DB },
    });
    log('mongo', `started in-memory instead — data will NOT survive this restart`);
  }
}

async function dashboardExists() {
  // Any saved workspace record means the database is in use. Checking more than
  // one collection matters: an empty housekeeping board must never be mistaken
  // for an empty database, or the seed would replace the whole workspace.
  const db = mongoose.connection.db;
  for (const name of ['settings', 'staff', 'rooms', 'beds', 'guests', 'reservations', 'payments', 'expenses', 'tasks']) {
    const found = await db.collection(name).findOne({}, { projection: { _id: 1 } });
    if (found) return true;
  }
  return false;
}

async function seedIfEmpty() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    if (await dashboardExists()) {
      log('seed', 'database already holds a workspace, keeping it as is');
      return;
    }
  } finally {
    await mongoose.disconnect();
  }
  log('seed', 'empty database, loading the demo workspace');
  await runOnce('seed', [path.join('scripts', 'seed.js')], {
    cwd: serverDir,
    env: { ...process.env, MONGODB_URI: mongoUri },
  });
  log('seed', 'demo workspace ready (hamza@stayora.app / stayora2026)');
}

async function startApi() {
  if (await isPortOpen(API_PORT)) {
    log('api', `reusing the API already listening on ${apiOrigin}`);
    return;
  }
  startProcess('api', process.execPath, ['--watch', 'src/index.js'], {
    cwd: serverDir,
    env: { ...process.env, MONGODB_URI: mongoUri, PORT: String(API_PORT) },
  });
  if (!(await waitForHttp(`${apiOrigin}/api/health`))) {
    throw new Error(`the API did not become healthy on ${apiOrigin}`);
  }
  log('api', `ready on ${apiOrigin}/api`);
}

async function startClient() {
  if (await isPortOpen(CLIENT_PORT)) {
    log('web', `reusing the client already serving ${clientOrigin}`);
    return;
  }
  startProcess(
    'web',
    process.execPath,
    [
      path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(CLIENT_PORT),
      '--strictPort',
    ],
    { cwd: clientDir },
  );
  if (!(await waitForPort(CLIENT_PORT))) {
    throw new Error(`the client did not start on ${clientOrigin}`);
  }
  log('web', `ready on ${clientOrigin}`);
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) child.kill();
  }
  if (memoryServer) {
    await memoryServer.stop().catch(() => {});
  }
  process.exit(code);
}

async function main() {
  log('dev', `starting the local stack from ${rootDir}`);
  await startMongo();
  await seedIfEmpty();
  await startApi();
  await startClient();

  console.log('');
  log('dev', `app        ${clientOrigin}`);
  log('dev', `api        ${apiOrigin}/api`);
  log('dev', `mongo      ${mongoUri} (persistent, ${MONGO_DATA_DIR})`);
  log('dev', 'sign in    hamza@stayora.app / stayora2026');
  log('dev', 'press Ctrl+C to stop everything');
  console.log('');
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch(async (error) => {
  log('dev', `failed: ${error.message}`);
  await shutdown(1);
});
