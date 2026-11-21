import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Media storage driver
 * --------------------
 * Binaries never live in MongoDB: only metadata is stored there. The driver
 * below writes to a directory outside the database, addressed by an opaque
 * storage key, so moving to object storage (S3, R2, ...) later means adding a
 * second driver with the same three methods and switching `CMS_MEDIA_DRIVER` —
 * no route, model or client change.
 *
 * `CMS_MEDIA_LOCAL_DIR` overrides the directory (default `server/uploads/cms`).
 */
const DRIVER = (process.env.CMS_MEDIA_DRIVER || 'local').toLowerCase();
const KEY_RE = /^[a-z0-9][a-z0-9/_-]{0,120}\.[a-z0-9]{2,5}$/i;

const defaultDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../uploads/cms');

function root() {
  return process.env.CMS_MEDIA_LOCAL_DIR
    ? path.resolve(process.env.CMS_MEDIA_LOCAL_DIR)
    : defaultDir;
}

function assertKey(key) {
  if (!KEY_RE.test(String(key || '')) || String(key).includes('..')) {
    throw new Error('Invalid media storage key.');
  }
  return key;
}

function resolveKey(key) {
  const target = path.resolve(root(), assertKey(key));
  if (!target.startsWith(`${root()}${path.sep}`)) {
    throw new Error('Invalid media storage key.');
  }
  return target;
}

const localDriver = {
  name: 'local',
  async put(key, buffer) {
    const target = resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { mode: 0o644 });
    return key;
  },
  async get(key) {
    return readFile(resolveKey(key));
  },
  async remove(key) {
    await unlink(resolveKey(key)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  },
};

/**
 * Object storage is declared but not configured yet. Using it without a driver
 * is a hard error rather than a silent fallback to disk, so a production
 * deployment can never write images somewhere unintended.
 */
export function mediaStorage() {
  if (DRIVER === 'local') return localDriver;
  throw Object.assign(
    new Error(
      `CMS_MEDIA_DRIVER=${DRIVER} is not available in this deployment. Configure the object-storage driver or use "local".`,
    ),
    { code: 'MEDIA_DRIVER_UNAVAILABLE', status: 503 },
  );
}

export function mediaStorageName() {
  return DRIVER;
}
