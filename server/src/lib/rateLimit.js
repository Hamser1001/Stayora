/**
 * Small fixed-window rate limiter for sensitive endpoints.
 *
 * Kept in-process on purpose: it protects the API from brute force and
 * credential stuffing bursts without adding infrastructure. Behind multiple
 * instances, pair it with the platform's edge limiter.
 */
const buckets = new Map();
let lastSweep = Date.now();

function sweep(now) {
  if (now - lastSweep < 60000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function createRateLimiter({ windowMs = 60000, max = 30, scope = 'default', key } = {}) {
  return function rateLimit(req, res, next) {
    const now = Date.now();
    sweep(now);
    const identity = key ? key(req) : req.user?.id || req.ip || 'anonymous';
    const bucketKey = `${scope}:${identity}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        message: 'Too many requests. Try again shortly.',
        code: 'RATE_LIMITED',
        details: { retryAfter },
      });
    }
    return next();
  };
}

export const __testing = { buckets };
