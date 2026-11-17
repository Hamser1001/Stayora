const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Avatars are stored as site-relative paths (e.g. `/uploads/avatars/x.jpg`).
 * The client may run on a different origin than the API, so resolve against it.
 */
export function avatarSrc(url) {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  const origin = /^https?:/i.test(API_BASE) ? new URL(API_BASE).origin : '';
  return `${origin}${url}`;
}
