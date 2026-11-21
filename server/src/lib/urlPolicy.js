import net from 'node:net';

/**
 * Outbound URL policy (SSRF guard).
 *
 * Only https URLs on a public host with a normal port are accepted. Loopback,
 * link-local, private ranges, cloud metadata addresses and credentials embedded
 * in the URL are rejected before anything is stored or requested.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

function isPrivateIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(address) {
  const value = address.toLowerCase();
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fe80') || value.startsWith('fc') || value.startsWith('fd')) return true;
  if (value.startsWith('::ffff:')) return isPrivateIPv4(value.slice(7));
  return false;
}

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
    this.code = 'UNSAFE_URL';
    this.status = 400;
  }
}

export function assertPublicHttpsUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new UnsafeUrlError('Enter a complete https:// address.');
  }
  if (url.protocol !== 'https:') throw new UnsafeUrlError('Only https:// addresses are allowed.');
  if (url.username || url.password) throw new UnsafeUrlError('Addresses cannot contain credentials.');
  if (url.port && !['443', '8443'].includes(url.port)) {
    throw new UnsafeUrlError('Only the standard https ports are allowed.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new UnsafeUrlError('Enter a complete https:// address.');
  if (BLOCKED_HOSTNAMES.has(host)) throw new UnsafeUrlError('That address is not reachable from the server.');
  if (net.isIP(host)) {
    if (net.isIPv4(host) ? isPrivateIPv4(host) : isPrivateIPv6(host)) {
      throw new UnsafeUrlError('Private or loopback addresses are not allowed.');
    }
  }
  if (!host.includes('.') && net.isIP(host) === 0) {
    throw new UnsafeUrlError('Enter a public host name.');
  }
  return url.toString();
}
