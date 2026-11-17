/**
 * Exchange-rate helpers.
 *
 * Rates arrive relative to a base currency (Frankfurter always quotes against
 * one base). Stored ledger amounts stay in the workspace base currency; every
 * display is converted from its source currency through that common base.
 */
export const FX_CACHE_PREFIX = 'stayora.fx.v2';
export const FX_TTL_MS = 6 * 60 * 60 * 1000;

export function convertAmount(value, from, to, fx) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const fromCode = String(from || '').toUpperCase();
  const toCode = String(to || '').toUpperCase();
  if (!fromCode || !toCode || fromCode === toCode) return amount;

  const rates = fx?.rates;
  if (!rates) return null;
  const fromRate = Number(rates[fromCode]);
  const toRate = Number(rates[toCode]);
  if (!(fromRate > 0) || !(toRate > 0)) return null;
  return (amount / fromRate) * toRate;
}

export function rateFor(from, to, fx) {
  return convertAmount(1, from, to, fx);
}

export function readRateCache(base, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(`${FX_CACHE_PREFIX}:${String(base).toUpperCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.rates !== 'object' || !parsed.rates) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRateCache(base, payload, storage = globalThis.localStorage) {
  try {
    storage?.setItem(
      `${FX_CACHE_PREFIX}:${String(base).toUpperCase()}`,
      JSON.stringify({
        base: payload.base,
        date: payload.date,
        rates: payload.rates,
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
      }),
    );
  } catch {
    // Private mode or a full quota: in-memory rates still work this session.
  }
}

export function isFreshRateCache(entry, now = Date.now()) {
  if (!entry?.fetchedAt) return false;
  const fetched = new Date(entry.fetchedAt).getTime();
  return Number.isFinite(fetched) && now - fetched < FX_TTL_MS;
}
