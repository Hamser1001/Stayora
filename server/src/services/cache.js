/**
 * Tiny TTL cache for expensive, read-only aggregates (counters, analytics,
 * reference collections). Writes are rare compared with reads, so a few
 * seconds of staleness on badge counters is an acceptable trade.
 */
const store = new Map();

export async function memo(key, ttlMs, load) {
  const now = Date.now();
  const entry = store.get(key);

  if (entry?.value !== undefined && entry.expires > now) return entry.value;
  if (entry?.pending) return entry.pending;

  const pending = (async () => {
    try {
      const value = await load();
      store.set(key, { value, expires: Date.now() + ttlMs, pending: null });
      return value;
    } catch (error) {
      store.delete(key);
      throw error;
    }
  })();

  store.set(key, { value: entry?.value, expires: entry?.expires || 0, pending });
  return pending;
}

export function invalidate(prefix) {
  for (const key of [...store.keys()]) {
    if (!prefix || key.startsWith(prefix)) store.delete(key);
  }
}
