#!/usr/bin/env node
/**
 * Security regression tests for the Integrations module.
 *
 * Run against a live API (default http://localhost:4000/api) with the demo
 * workspace seeded:
 *
 *   npm run test:integrations
 *
 * Covers authentication, authorization, tenant scoping, encrypted storage,
 * secret-free responses, webhook signatures/replay/idempotency, SSRF rejection,
 * rate limiting, fail-closed key handling, audit hygiene and the built bundle.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const API = process.env.API_URL || 'http://localhost:4000/api';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/stayora';
const PASSWORD = process.env.DEMO_PASSWORD || 'stayora2026';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'hamza@stayora.app';
const SENTINEL = `SENTINEL-${crypto.randomBytes(12).toString('hex')}`;
const WEBHOOK_SECRET = `whsec-${crypto.randomBytes(18).toString('hex')}`;

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(pathname, { method = 'GET', token, body, rawBody, headers = {} } = {}) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: rawBody !== undefined ? rawBody : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, text, json, headers: response.headers };
}

async function login(email, password = PASSWORD) {
  const res = await call('/auth/login', {
    method: 'POST',
    body: { email, password, remember: true },
  });
  return { token: res.json?.data?.token || null, user: res.json?.data?.user || null, status: res.status };
}

async function main() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const db = mongo.db();

  const owner = await login(OWNER_EMAIL);
  if (!owner.token) {
    console.error(`Could not sign in as the owner (${owner.status}). Is the API running and seeded?`);
    process.exitCode = 1;
    return;
  }

  // The write limiter is deliberately tight (20/min). A previous run may still
  // own that budget, so wait for the window to roll over before asserting.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const probe = await call('/integrations/booking_com/test', { method: 'POST', token: owner.token });
    if (probe.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  const staff = await db.collection('staff').find({}, { projection: { email: 1, role: 1, id: 1 } }).toArray();
  const managerEmail = staff.find((member) => member.role === 'manager')?.email;
  const receptionistEmail = staff.find((member) => member.role === 'receptionist')?.email;
  const manager = managerEmail ? await login(managerEmail) : { token: null };
  const receptionist = receptionistEmail ? await login(receptionistEmail) : { token: null };

  /* ------------------------- 1. Authentication ------------------------- */
  const anonymous = await call('/integrations');
  record('Integration list requires authentication', anonymous.status === 401, `status ${anonymous.status}`);

  if (receptionist.token) {
    const forbidden = await call('/integrations', { token: receptionist.token });
    record(
      'Staff without the integrations permission cannot read the module',
      forbidden.status === 403,
      `status ${forbidden.status}`,
    );
  } else {
    record('Receptionist fixture available', false, 'no receptionist account to test');
  }

  if (manager.token) {
    const read = await call('/integrations', { token: manager.token });
    record(
      'Manager can view integration status',
      read.status === 200 && read.json?.data?.canManage === false,
      `status ${read.status}, canManage=${read.json?.data?.canManage}`,
    );
    const write = await call('/integrations/booking_com/credentials', {
      method: 'POST',
      token: manager.token,
      body: { credentials: { apiToken: SENTINEL } },
    });
    record(
      'Only the owner can store credentials',
      write.status === 403,
      `status ${write.status}`,
    );
  } else {
    record('Manager fixture available', false, 'no manager account to test');
  }

  /* ---------------------- 2. Encrypted storage ------------------------- */
  const before = await call('/integrations', { token: owner.token });
  record('Owner receives the provider catalog', Array.isArray(before.json?.data?.groups) && before.json.data.groups.length === 2);

  const save = await call('/integrations/booking_com/credentials', {
    method: 'POST',
    token: owner.token,
    body: {
      credentials: { apiToken: SENTINEL },
      config: { propertyId: 'TEST-PROP-1' },
      workspaceKey: 'some-other-tenant',
    },
  });
  record('Owner can store Booking.com credentials', save.status === 201, `status ${save.status}`);
  record(
    'Credential response never echoes the secret',
    !save.text.includes(SENTINEL),
    save.text.includes(SENTINEL) ? 'SECRET LEAKED' : 'clean',
  );
  record(
    'Credentials with no verified channel show pending approval',
    save.json?.data?.status === 'pending_approval',
    `status=${save.json?.data?.status}`,
  );

  const doc = await db.collection('integrations').findOne({ provider: 'booking_com' });
  const stored = JSON.stringify(doc || {});
  record('Database stores ciphertext, not the secret', !stored.includes(SENTINEL), stored.includes(SENTINEL) ? 'PLAINTEXT IN DB' : 'encrypted');
  record(
    'Stored envelope uses AES-256-GCM fields',
    Boolean(doc?.secrets?.apiToken?.ct && doc?.secrets?.apiToken?.iv && doc?.secrets?.apiToken?.tag),
  );
  record(
    'Client-supplied workspace key is ignored',
    doc?.workspaceKey === 'workspace' && (await db.collection('integrations').countDocuments({ workspaceKey: { $ne: 'workspace' } })) === 0,
    `workspaceKey=${doc?.workspaceKey}`,
  );

  const listAfter = await call('/integrations', { token: owner.token });
  record(
    'List response never contains credential material',
    !/"(ct|iv|tag)":/.test(listAfter.text) && !listAfter.text.includes(SENTINEL),
    /"(ct|iv|tag)":/.test(listAfter.text) ? 'CIPHERTEXT EXPOSED' : 'metadata only',
  );

  const rotate = await call('/integrations/booking_com/rotate', { method: 'POST', token: owner.token });
  const rotated = await db.collection('integrations').findOne({ provider: 'booking_com' });
  record(
    'Rotation re-encrypts stored credentials',
    rotate.status === 200 && rotated?.credentialVersion > doc?.credentialVersion && !JSON.stringify(rotated).includes(SENTINEL),
    `version ${doc?.credentialVersion}→${rotated?.credentialVersion}`,
  );

  const disable = await call('/integrations/booking_com', {
    method: 'PATCH',
    token: owner.token,
    body: { enabled: false },
  });
  record('Owner can disable an integration', disable.json?.data?.status === 'disabled', `status=${disable.json?.data?.status}`);
  await call('/integrations/booking_com', { method: 'PATCH', token: owner.token, body: { enabled: true } });

  const connection = await call('/integrations/booking_com/test', { method: 'POST', token: owner.token });
  record(
    'Connection test never claims an unverified channel',
    connection.status === 200 && connection.json?.data?.verified === false,
    `verified=${connection.json?.data?.verified}`,
  );

  /* ------------------------- 3. Validation ----------------------------- */
  const unknownField = await call('/integrations/booking_com/credentials', {
    method: 'POST',
    token: owner.token,
    body: { credentials: { apiToken: SENTINEL, admin: 'x' } },
  });
  record('Unknown credential fields are rejected', unknownField.status === 400, `status ${unknownField.status}`);

  const empty = await call('/integrations/booking_com/credentials', {
    method: 'POST',
    token: owner.token,
    body: { credentials: {} },
  });
  record('Empty credentials are rejected', empty.status === 400, `status ${empty.status}`);

  const approvalOnly = await call('/integrations/airbnb/credentials', {
    method: 'POST',
    token: owner.token,
    body: { credentials: { apiToken: SENTINEL } },
  });
  record(
    'Providers that require partner approval refuse credentials',
    approvalOnly.status === 409,
    `status ${approvalOnly.status}`,
  );

  const ssrfHttp = await call('/integrations/webhooks/credentials', {
    method: 'POST',
    token: owner.token,
    body: { credentials: { signingSecret: WEBHOOK_SECRET }, config: { callbackUrl: 'http://127.0.0.1:4000/hook' } },
  });
  record('Plain http callback URLs are rejected', ssrfHttp.status === 400, `status ${ssrfHttp.status}`);

  const ssrfLocal = await call('/integrations/webhooks/credentials', {
    method: 'POST',
    token: owner.token,
    body: { credentials: { signingSecret: WEBHOOK_SECRET }, config: { callbackUrl: 'https://localhost/hook' } },
  });
  record('Loopback callback hostnames are rejected', ssrfLocal.status === 400, `status ${ssrfLocal.status}`);

  /* -------------------------- 4. Webhooks ------------------------------ */
  const webhookSave = await call('/integrations/webhooks/credentials', {
    method: 'POST',
    token: owner.token,
    body: { credentials: { signingSecret: WEBHOOK_SECRET }, config: { callbackUrl: 'https://hooks.example.com/stayora' } },
  });
  record('Webhook signing secret is stored', webhookSave.status === 201, `status ${webhookSave.status}`);
  record(
    'Webhook integration reports connected (local contract)',
    webhookSave.json?.data?.status === 'connected',
    `status=${webhookSave.json?.data?.status}`,
  );

  const eventId = `evt_${crypto.randomBytes(6).toString('hex')}`;
  const payload = JSON.stringify({ type: 'reservation.created', id: 'res_test' });
  const now = Math.floor(Date.now() / 1000);
  const sign = (timestamp, body) =>
    crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');

  const badSig = await call('/integrations/inbound/webhooks', {
    method: 'POST',
    rawBody: payload,
    headers: { 'X-Stayora-Timestamp': String(now), 'X-Stayora-Signature': 'deadbeef', 'X-Stayora-Event-Id': eventId },
  });
  record('Invalid webhook signature is rejected', badSig.status === 401, `status ${badSig.status}`);

  const stale = await call('/integrations/inbound/webhooks', {
    method: 'POST',
    rawBody: payload,
    headers: {
      'X-Stayora-Timestamp': String(now - 3600),
      'X-Stayora-Signature': sign(now - 3600, payload),
      'X-Stayora-Event-Id': `${eventId}-old`,
    },
  });
  record('Stale webhook timestamps are rejected (replay)', stale.status === 401, `status ${stale.status}`);

  const unsigned = await call('/integrations/inbound/webhooks', { method: 'POST', rawBody: payload });
  record('Unsigned webhook is rejected', unsigned.status === 401, `status ${unsigned.status}`);

  const good = await call('/integrations/inbound/webhooks', {
    method: 'POST',
    rawBody: payload,
    headers: {
      'X-Stayora-Timestamp': String(now),
      'X-Stayora-Signature': sign(now, payload),
      'X-Stayora-Event-Id': eventId,
    },
  });
  record('Valid webhook signature is accepted', good.status === 202, `status ${good.status}`);

  const replay = await call('/integrations/inbound/webhooks', {
    method: 'POST',
    rawBody: payload,
    headers: {
      'X-Stayora-Timestamp': String(Math.floor(Date.now() / 1000)),
      'X-Stayora-Signature': sign(Math.floor(Date.now() / 1000), payload),
      'X-Stayora-Event-Id': eventId,
    },
  });
  record(
    'Duplicate events are idempotent',
    replay.status === 200 && replay.json?.data?.duplicate === true,
    `status ${replay.status}, duplicate=${replay.json?.data?.duplicate}`,
  );

  const unsupported = await call('/integrations/inbound/booking_com', {
    method: 'POST',
    rawBody: payload,
    headers: { 'X-Stayora-Timestamp': String(now), 'X-Stayora-Signature': 'deadbeef', 'X-Stayora-Event-Id': 'x' },
  });
  record(
    'Providers without a documented webhook scheme are refused',
    unsupported.status === 501,
    `status ${unsupported.status}`,
  );

  /* ---------------------------- Cleanup -------------------------------- */
  // Revoke before the throttling test: the write limiter is deliberately tight.
  await call('/integrations/booking_com/credentials', { method: 'DELETE', token: owner.token });
  await call('/integrations/webhooks/credentials', { method: 'DELETE', token: owner.token });
  await db.collection('webhook_events').deleteMany({ provider: 'webhooks', dedupeKey: eventId });
  const remaining = await db
    .collection('integrations')
    .find({}, { projection: { _id: 0, provider: 1, status: 1, secretFields: 1 } })
    .toArray();
  record(
    'Revoked integrations keep no credential material',
    remaining.every((entry) => (entry.secretFields || []).length === 0),
    JSON.stringify(remaining),
  );

  /* ------------------------ 5. Rate limiting --------------------------- */
  let limited = 0;
  for (let i = 0; i < 26; i += 1) {
    const res = await call('/integrations/booking_com/test', { method: 'POST', token: owner.token });
    if (res.status === 429) limited += 1;
  }
  record('Sensitive endpoints are rate limited', limited > 0, `${limited} throttled responses`);

  /* --------------------------- 6. Audit log ---------------------------- */
  const audit = await db.collection('activity').find({ action: /^integration\./ }).toArray();
  record('Integration actions are audited', audit.length > 0, `${audit.length} entries`);
  record(
    'Audit entries never contain secrets',
    !JSON.stringify(audit).includes(SENTINEL) && !JSON.stringify(audit).includes(WEBHOOK_SECRET),
    JSON.stringify(audit).includes(SENTINEL) ? 'SECRET IN AUDIT' : 'clean',
  );
  record(
    'Webhook rejections are audited',
    audit.some((entry) => entry.action === 'integration.webhook_rejected'),
  );

  /* --------------------- 7. Fail-closed without key -------------------- */
  const probe = `
    const { encryptSecret } = await import('./src/services/integrations/crypto.js');
    try {
      encryptSecret('test', { workspaceKey: 'workspace', provider: 'booking_com', field: 'apiToken' });
      console.log('ENCRYPTED_WITHOUT_KEY');
    } catch (error) {
      console.log('FAILED_CLOSED:' + error.code);
    }
  `;
  const env = { ...process.env };
  delete env.INTEGRATION_ENCRYPTION_KEY;
  delete env.INTEGRATION_ENCRYPTION_KEY_FILE;
  const probeOut = execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env,
    encoding: 'utf8',
  }).trim();
  record(
    'Missing encryption key fails closed',
    probeOut === 'FAILED_CLOSED:INTEGRATION_STORAGE_UNAVAILABLE',
    probeOut,
  );

  /* ---------------------- 8. Frontend bundle scan ---------------------- */
  const distDir = path.resolve(import.meta.dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(distDir)) {
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(distDir);
    const bundle = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    record(
      'Built frontend bundle contains no secret material',
      !bundle.includes(SENTINEL) && !bundle.includes(WEBHOOK_SECRET) && !bundle.includes(process.env.INTEGRATION_ENCRYPTION_KEY || '\u0000'),
      `${files.length} files scanned`,
    );
    record('Bundle never references the encryption key variable', !bundle.includes('INTEGRATION_ENCRYPTION_KEY'));
  } else {
    record('Built frontend bundle available', false, 'run client build first');
  }

  await mongo.close();

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} security checks passed.`);
  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const failure of failed) console.log(`- ${failure.name}${failure.detail ? `: ${failure.detail}` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
