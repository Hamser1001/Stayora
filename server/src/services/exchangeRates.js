import { ApiError } from '../middleware/error.js';
import { SUPPORTED_CURRENCIES } from '../lib/currencies.js';

/**
 * Frankfurter reference rates (ECB daily fixing), cached in-process.
 *
 * Frankfurter has no Moroccan dirham, so supported currencies it does not quote
 * (currently MAD) are filled from a complementary free feed. That extra lookup
 * is best-effort: if it fails the Frankfurter rates remain valid and the client
 * simply shows MAD amounts in the base currency until a rate is available.
 *
 * A failed refresh keeps serving the last good snapshot so the UI never has to
 * invent a rate; with no snapshot at all the route answers 502 and the client
 * falls back to the currency the amounts are actually recorded in.
 */
const DEFAULT_URL = 'https://api.frankfurter.dev/v1/latest';
const FALLBACK_URL = process.env.FX_FALLBACK_API_URL || 'https://open.er-api.com/v6/latest/EUR';
const TTL_MS = Number(process.env.FX_CACHE_TTL_MS) || 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

const cache = new Map();

export function clearExchangeRateCache() {
  cache.clear();
}

function normalise({ base, symbols }) {
  const code = String(base || 'EUR').toUpperCase();
  const list = [...new Set((symbols || []).map((symbol) => String(symbol).toUpperCase()))]
    .filter((symbol) => symbol && symbol !== code)
    .sort();
  return { code, list };
}

async function fetchJson(url, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await (fetcher || fetch)(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Rate provider responded with ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Fill supported currencies Frankfurter does not publish (MAD). */
async function fillMissingRates(payload, fetcher) {
  const missing = SUPPORTED_CURRENCIES.filter(
    (code) => code !== payload.base && !(Number(payload.rates[code]) > 0),
  );
  if (missing.length === 0) return payload;

  try {
    const body = await fetchJson(FALLBACK_URL, fetcher);
    const table = body?.rates;
    if (!table || typeof table !== 'object') return payload;

    // The fallback table is EUR-based; cross it with the base's EUR rate.
    const eurPerBase = payload.base === 'EUR' ? 1 : Number(payload.rates.EUR);
    if (!(eurPerBase > 0)) return payload;

    const filled = {};
    for (const code of missing) {
      const eurToCode = Number(table[code]);
      if (eurToCode > 0) {
        payload.rates[code] = eurPerBase * eurToCode;
        filled[code] = true;
      }
    }
    if (Object.keys(filled).length > 0) {
      payload.fallback = {
        source: 'exchangerate-api.com',
        date: body.time_last_update_utc || null,
        codes: filled,
      };
    }
  } catch {
    // MAD (or another complementary currency) is optional; keep the primary rates.
  }
  return payload;
}

export async function getExchangeRates({ base = 'EUR', symbols = [], fetcher } = {}) {
  const { code, list } = normalise({ base, symbols });
  const key = `${code}|${list.join(',')}`;
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < TTL_MS) {
    return {
      ...cached.payload,
      cached: true,
      stale: false,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
    };
  }

  // Always ask Frankfurter for the full table: some requested currencies (MAD)
  // are not in its symbol list and would turn the whole request into a 404.
  const url = new URL(process.env.FRANKFURTER_API_URL || DEFAULT_URL);
  url.searchParams.set('base', code);

  try {
    const body = await fetchJson(url.toString(), fetcher);
    if (!body || typeof body.rates !== 'object' || Array.isArray(body.rates)) {
      throw new Error('Frankfurter returned no exchange rates.');
    }

    const baseCode = String(body.base || code).toUpperCase();
    const payload = {
      base: baseCode,
      date: body.date || null,
      rates: { ...body.rates, [baseCode]: 1 },
    };
    await fillMissingRates(payload, fetcher);

    if (list.length > 0) {
      payload.rates = {
        ...Object.fromEntries(
          list.filter((symbol) => payload.rates[symbol] !== undefined).map((symbol) => [
            symbol,
            payload.rates[symbol],
          ]),
        ),
        [baseCode]: 1,
      };
    }

    const fetchedAt = Date.now();
    cache.set(key, { payload, fetchedAt });
    return { ...payload, cached: false, stale: false, fetchedAt: new Date(fetchedAt).toISOString() };
  } catch {
    if (cached) {
      return {
        ...cached.payload,
        cached: true,
        stale: true,
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        warning: 'Live rates are unavailable; using the last cached snapshot.',
      };
    }
    throw new ApiError('Exchange rates are temporarily unavailable.', {
      code: 'RATES_UNAVAILABLE',
      status: 502,
    });
  }
}

export { TTL_MS as RATE_CACHE_TTL_MS };
