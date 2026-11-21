import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * Credential encryption
 * ---------------------
 * Integration credentials are sealed with AES-256-GCM before they touch the
 * database. The key never lives in the database, in the repository or in the
 * frontend: it is read from the process environment, or from a file path that
 * points at a mounted secret.
 *
 * When no usable key is configured every write path fails closed — there is no
 * plaintext fallback anywhere in this module.
 */

const KEY_ENV = 'INTEGRATION_ENCRYPTION_KEY';
const KEY_FILE_ENV = 'INTEGRATION_ENCRYPTION_KEY_FILE';
const KEY_VERSION_ENV = 'INTEGRATION_KEY_VERSION';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecureStorageError extends Error {
  constructor(message, { code = 'INTEGRATION_STORAGE_UNAVAILABLE', status = 503 } = {}) {
    super(message);
    this.name = 'SecureStorageError';
    this.code = code;
    this.status = status;
  }
}

function decodeKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  let buffer = null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    buffer = Buffer.from(value, 'hex');
  } else {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      buffer = null;
    }
  }
  if (!buffer || buffer.length !== 32) return null;
  return buffer;
}

function readKeyFile(path) {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

let cached = null;

/**
 * Resolves the encryption key once per process.
 * @returns {{ key: Buffer, version: string } | null}
 */
export function encryptionKey() {
  if (cached) return cached.key ? cached : null;

  let raw = process.env[KEY_ENV] || '';
  if (!raw) {
    const filePath = process.env[KEY_FILE_ENV] || '';
    if (filePath) raw = readKeyFile(filePath) || '';
  }
  const key = decodeKey(raw);
  const version = String(process.env[KEY_VERSION_ENV] || 'v1').slice(0, 16);
  cached = { key, version };
  if (!key) {
    // Never include the provided value in the message.
    console.warn(
      `[integrations] secure credential storage is disabled: ${KEY_ENV} (32 bytes, base64 or hex) or ${KEY_FILE_ENV} is missing or invalid.`,
    );
    return null;
  }
  return cached;
}

/** Safe to expose to the frontend: whether writes are possible, never the key. */
export function encryptionState() {
  const state = encryptionKey();
  return {
    configured: Boolean(state?.key),
    keyVersion: state?.version || null,
  };
}

export function requireEncryptionKey() {
  const state = encryptionKey();
  if (!state?.key) {
    throw new SecureStorageError(
      'Secure credential storage is not configured on this server, so credentials were not saved.',
    );
  }
  return state;
}

/** Binds ciphertext to its workspace, provider and field so it cannot be swapped. */
function associatedData(context) {
  return Buffer.from(`stayora:v1:${context.workspaceKey}:${context.provider}:${context.field}`, 'utf8');
}

export function encryptSecret(plaintext, context) {
  const { key, version } = requireEncryptionKey();
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new SecureStorageError('Nothing to encrypt.', { code: 'VALIDATION_ERROR', status: 400 });
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(associatedData(context));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    v: version,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

/**
 * Decrypts an envelope. Only server-side adapters call this; nothing returned
 * to the browser ever contains its output.
 */
export function decryptSecret(envelope, context) {
  const { key, version } = requireEncryptionKey();
  if (!envelope || typeof envelope !== 'object') {
    throw new SecureStorageError('Credential envelope is missing.', {
      code: 'INTEGRATION_CREDENTIAL_INVALID',
      status: 409,
    });
  }
  if (envelope.v && envelope.v !== version) {
    throw new SecureStorageError(
      'Stored credentials were sealed with a different key version. Re-enter them to rotate.',
      { code: 'INTEGRATION_KEY_MISMATCH', status: 409 },
    );
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ct, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new SecureStorageError('Stored credentials could not be decrypted.', {
      code: 'INTEGRATION_CREDENTIAL_UNREADABLE',
      status: 409,
    });
  }
}

/** Constant-time string comparison for signatures and shared secrets. */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

export function hmacSha256(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export const __testing = { decodeKey, KEY_ENV, KEY_FILE_ENV };
