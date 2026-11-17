import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { ApiError } from '../middleware/error.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(here, '../../uploads/avatars');
const PUBLIC_PREFIX = '/uploads/avatars/';
/** Cropped avatars are 512² JPEGs; this ceiling leaves generous headroom. */
const MAX_BYTES = 3 * 1024 * 1024;

const SIGNATURES = {
  png: (buffer) => buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  jpeg: (buffer) => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  webp: (buffer) =>
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP',
};

function invalid(message, code = 'INVALID_IMAGE') {
  return new ApiError(message, { code, status: 400 });
}

/**
 * Decodes a base64 data URL, verifies it really is the image type it claims,
 * and writes it under a random name. The original filename is never trusted.
 */
export async function saveAvatarImage(memberId, dataUrl) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) throw invalid('Choose a JPG, PNG or WebP image.');

  const [, declared, encoded] = match;
  const buffer = Buffer.from(encoded.replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) throw invalid('That image could not be read.');
  if (buffer.length > MAX_BYTES) {
    throw new ApiError('That image is too large. Choose one under 3 MB.', {
      code: 'IMAGE_TOO_LARGE',
      status: 413,
    });
  }
  if (!SIGNATURES[declared]?.(buffer)) {
    throw invalid('That file is not a valid image.');
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const safeId = String(memberId || 'member').replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `${safeId}-${crypto.randomBytes(12).toString('hex')}.${declared}`;
  await writeFile(path.join(UPLOAD_DIR, filename), buffer, { mode: 0o644 });

  return `${PUBLIC_PREFIX}${filename}`;
}

function filePathFor(url) {
  if (typeof url !== 'string' || !url.startsWith(PUBLIC_PREFIX)) return null;
  const filename = path.basename(url);
  if (!/^[a-zA-Z0-9_-]+\.(png|jpeg|webp)$/.test(filename)) return null;
  return path.join(UPLOAD_DIR, filename);
}

/** Best-effort cleanup: removing a file must never fail the request. */
export async function removeAvatarImage(url) {
  const file = filePathFor(url);
  if (!file) return;
  try {
    await unlink(file);
  } catch {
    // Already gone or never written; nothing to do.
  }
}
