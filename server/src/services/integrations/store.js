import { models } from '../../db/models.js';
import { logActivity } from '../activity.js';
import { decryptSecret, encryptSecret, requireEncryptionKey, SecureStorageError } from './crypto.js';
import { providerDefinition } from './registry.js';

/**
 * Integration storage
 * -------------------
 * One document per provider. Every read and write is scoped to the workspace
 * key resolved here on the server — a request can never choose it.
 *
 * Decrypted credentials are only ever returned by `decryptedCredentials()`,
 * which exists for server-side adapters and is not reachable from any route.
 */

export const WORKSPACE_KEY = 'workspace';

const SENSITIVE_KEYS = new Set(['secrets', 'secretFields', 'apiToken', 'signingSecret', 'password', 'token']);

/** Strips anything secret-shaped from free text before it is stored or logged. */
export function scrubMessage(value, max = 200) {
  const text = String(value || '')
    .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '[redacted]')
    .replace(/\b(?:sk|pk|rk)_[A-Za-z0-9]{8,}\b/g, '[redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max);
}

function nowISO() {
  return new Date().toISOString();
}

function blank(provider) {
  return {
    id: `int_${provider}`,
    workspaceKey: WORKSPACE_KEY,
    provider,
    status: 'not_connected',
    enabled: false,
    secrets: {},
    secretFields: [],
    config: {},
    credentialVersion: 0,
    lastRotatedAt: null,
    lastSyncAt: null,
    lastSyncResult: null,
    mappings: [],
    createdAt: null,
    updatedAt: null,
    updatedBy: '',
  };
}

function hasCredentials(doc) {
  return Array.isArray(doc?.secretFields) && doc.secretFields.length > 0;
}

/** Server-side state machine; the frontend never decides a status. */
export function deriveStatus(definition, doc) {
  if (!hasCredentials(doc)) return 'not_connected';
  if (!doc.enabled) return 'disabled';
  return definition.statusWhenConfigured || 'not_connected';
}

export function mappingSummary(doc) {
  const mappings = Array.isArray(doc?.mappings) ? doc.mappings : [];
  return mappings.map((mapping) => ({
    roomId: mapping.roomId || null,
    externalPropertyId: mapping.externalPropertyId || '',
    externalRoomId: mapping.externalRoomId || '',
    updatedAt: mapping.updatedAt || null,
  }));
}

/** Whitelisted shape sent to the browser: no ciphertext, no plaintext, no keys. */
export function publicIntegration(definition, doc) {
  const record = doc || blank(definition.key);
  const config = {};
  for (const field of definition.configFields || []) {
    if (record.config && record.config[field.key] !== undefined) {
      config[field.key] = record.config[field.key];
    }
  }
  const lastSync = record.lastSyncResult || null;
  return {
    key: definition.key,
    status: deriveStatus(definition, record),
    enabled: Boolean(record.enabled),
    hasCredentials: hasCredentials(record),
    credentialVersion: record.credentialVersion || 0,
    lastRotatedAt: record.lastRotatedAt || null,
    lastSyncAt: record.lastSyncAt || null,
    lastSyncResult: lastSync
      ? { ok: Boolean(lastSync.ok), message: scrubMessage(lastSync.message), at: lastSync.at || null }
      : null,
    config,
    mappings: mappingSummary(record),
    updatedAt: record.updatedAt || null,
    updatedBy: record.updatedBy || '',
  };
}

async function findDoc(provider) {
  return models.Integration.findOne({ workspaceKey: WORKSPACE_KEY, provider }).lean();
}

export async function getIntegration(definition) {
  return publicIntegration(definition, await findDoc(definition.key));
}

export async function listIntegrations(definitions) {
  const docs = await models.Integration.find({ workspaceKey: WORKSPACE_KEY }).lean();
  const byProvider = new Map(docs.map((doc) => [doc.provider, doc]));
  return definitions.map((definition) =>
    publicIntegration(definition, byProvider.get(definition.key)),
  );
}

/** Validates and seals credential values, then upserts the provider record. */
export async function saveCredentials({ definition, values, config, actor, rotate = false }) {
  // Fail closed: without a usable key nothing is written, plaintext or otherwise.
  requireEncryptionKey();

  const secrets = {};
  const fieldNames = [];
  for (const field of definition.credentialFields || []) {
    const value = values?.[field.key];
    if (field.required && (!value || String(value).trim().length === 0)) {
      throw new SecureStorageError(`${field.label} is required.`, {
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const plaintext = String(value).trim();
    if (plaintext.length > 4096) {
      throw new SecureStorageError(`${field.label} is too long.`, {
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }
    secrets[field.key] = encryptSecret(plaintext, {
      workspaceKey: WORKSPACE_KEY,
      provider: definition.key,
      field: field.key,
    });
    fieldNames.push(field.key);
  }

  if (fieldNames.length === 0) {
    throw new SecureStorageError('Enter the credentials for this integration.', {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  const existing = await models.Integration.findOne({
    workspaceKey: WORKSPACE_KEY,
    provider: definition.key,
  });
  const version = (existing?.credentialVersion || 0) + 1;
  const timestamp = nowISO();

  const nextConfig = { ...(existing?.config || {}) };
  for (const field of definition.configFields || []) {
    if (config && config[field.key] !== undefined) {
      nextConfig[field.key] = config[field.key];
    }
  }

  const doc =
    existing ||
    new models.Integration({
      id: `int_${definition.key}`,
      workspaceKey: WORKSPACE_KEY,
      provider: definition.key,
      createdAt: timestamp,
    });

  doc.secrets = secrets;
  doc.secretFields = fieldNames;
  doc.config = nextConfig;
  doc.credentialVersion = version;
  doc.lastRotatedAt = rotate ? timestamp : doc.lastRotatedAt || timestamp;
  doc.enabled = true;
  doc.status = deriveStatus(definition, { ...doc.toObject(), enabled: true });
  doc.updatedAt = timestamp;
  doc.updatedBy = actor?.name || actor?.id || '';
  doc.secrets = secrets;
  await doc.save();

  await logActivity({
    actor,
    action: rotate ? 'integration.credentials_rotated' : 'integration.credentials_stored',
    entity: 'integration',
    entityId: doc.id,
    meta: {
      provider: definition.key,
      // Field names only — never the values.
      credentialFields: fieldNames,
      credentialVersion: version,
    },
  });

  return publicIntegration(definition, doc.toObject());
}

export async function revokeCredentials({ definition, actor }) {
  const doc = await models.Integration.findOne({
    workspaceKey: WORKSPACE_KEY,
    provider: definition.key,
  });
  if (!doc || !hasCredentials(doc.toObject())) {
    return { revoked: false, integration: publicIntegration(definition, doc?.toObject()) };
  }

  doc.secrets = {};
  doc.secretFields = [];
  doc.enabled = false;
  doc.status = 'not_connected';
  doc.credentialVersion = (doc.credentialVersion || 0) + 1;
  doc.updatedAt = nowISO();
  doc.updatedBy = actor?.name || actor?.id || '';
  await doc.save();

  await logActivity({
    actor,
    action: 'integration.credentials_revoked',
    entity: 'integration',
    entityId: doc.id,
    meta: { provider: definition.key, credentialVersion: doc.credentialVersion },
  });

  return { revoked: true, integration: publicIntegration(definition, doc.toObject()) };
}

export async function setEnabled({ definition, enabled, actor }) {
  const doc = await models.Integration.findOne({
    workspaceKey: WORKSPACE_KEY,
    provider: definition.key,
  });
  if (!doc) {
    throw new SecureStorageError('Configure this integration before enabling it.', {
      code: 'INTEGRATION_NOT_CONFIGURED',
      status: 409,
    });
  }
  doc.enabled = Boolean(enabled);
  doc.status = deriveStatus(definition, doc.toObject());
  doc.updatedAt = nowISO();
  doc.updatedBy = actor?.name || actor?.id || '';
  await doc.save();

  await logActivity({
    actor,
    action: enabled ? 'integration.enabled' : 'integration.disabled',
    entity: 'integration',
    entityId: doc.id,
    meta: { provider: definition.key },
  });

  return publicIntegration(definition, doc.toObject());
}

export async function recordSync({ definition, ok, message, actor = null }) {
  const doc = await models.Integration.findOne({
    workspaceKey: WORKSPACE_KEY,
    provider: definition.key,
  });
  if (!doc) return null;
  const at = nowISO();
  doc.lastSyncAt = at;
  doc.lastSyncResult = { ok: Boolean(ok), message: scrubMessage(message), at };
  if (!ok && doc.enabled) doc.status = 'error';
  if (ok) doc.status = deriveStatus(definition, doc.toObject());
  await doc.save();

  await logActivity({
    actor,
    action: ok ? 'integration.synchronized' : 'integration.sync_failed',
    entity: 'integration',
    entityId: doc.id,
    meta: { provider: definition.key, message: scrubMessage(message) },
  });

  return publicIntegration(definition, doc.toObject());
}

/**
 * Server-side only. Returns decrypted credential values for an adapter.
 * Never call this from a route handler.
 */
export async function decryptedCredentials(definition) {
  const doc = await findDoc(definition.key);
  if (!doc || !hasCredentials(doc)) return {};
  const values = {};
  for (const field of doc.secretFields) {
    const envelope = doc.secrets?.[field];
    if (!envelope) continue;
    values[field] = decryptSecret(envelope, {
      workspaceKey: WORKSPACE_KEY,
      provider: definition.key,
      field,
    });
  }
  return values;
}

/** Re-encrypts stored credentials with the current key (key rotation support). */
export async function rotateEncryption({ definition, actor }) {
  const values = await decryptedCredentials(definition);
  if (Object.keys(values).length === 0) {
    throw new SecureStorageError('There are no stored credentials to rotate.', {
      code: 'INTEGRATION_NOT_CONFIGURED',
      status: 409,
    });
  }
  return saveCredentials({ definition, values, actor, rotate: true });
}

export async function findIntegrationDefinition(provider) {
  return providerDefinition(provider);
}

export { SENSITIVE_KEYS };
