/**
 * Server-side image inspection.
 *
 * Uploads are never trusted: the file type is taken from the bytes, not from
 * the client's claim, and dimensions are read from the container header. Only
 * the formats the dashboard can render are accepted.
 */
export const SUPPORTED_IMAGE_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
});

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function png(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { mime: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function gif(buffer) {
  if (buffer.length < 10) return null;
  const header = buffer.toString('ascii', 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  return { mime: 'image/gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function jpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset + 2);
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      return {
        mime: 'image/jpeg',
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

function webp(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { mime: 'image/webp', width, height };
  }
  if (chunk === 'VP8 ') {
    return {
      mime: 'image/webp',
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      mime: 'image/webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

/** Returns `{ mime, width, height }` or null when the bytes are not a supported image. */
export function probeImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const probe = png(buffer) || jpeg(buffer) || gif(buffer) || webp(buffer);
  if (!probe || !probe.width || !probe.height) return null;
  return probe;
}

export function extensionFor(mime) {
  return SUPPORTED_IMAGE_TYPES[mime] || 'bin';
}
