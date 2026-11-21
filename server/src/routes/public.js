import { Router } from 'express';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { publicMedia, publicPage, publicRooms, publicSite } from '../services/cms/public.js';
import { mediaStorage } from '../services/cms/mediaStorage.js';
import { availabilityForSite, createPublicBooking } from '../services/booking.js';

/**
 * Public website API
 * ------------------
 * No session, no workspace input and no drafts. The future website is a
 * separate application that talks only to this prefix (content) and to the
 * core reservation API (availability, rates, bookings) — never to MongoDB.
 *
 * Reads are cacheable and CORS-open because the site runs on its own origin;
 * nothing here is personalised or tenant-unsafe.
 */
const router = Router();

const readLimiter = createRateLimiter({
  windowMs: 60000,
  max: 600,
  scope: 'cms:public',
  key: (req) => req.ip || 'anonymous',
});

// A booking is a real reservation: allow a normal browsing rhythm, not a burst.
const bookingLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 40,
  scope: 'public:booking',
  key: (req) => req.ip || 'anonymous',
});

function limitBookingBody(req, res, next) {
  const declared = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(declared) && declared > 16 * 1024) {
    return next(new ApiError('The request body is too large.', { code: 'PAYLOAD_TOO_LARGE', status: 413 }));
  }
  return next();
}

router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

router.use(readLimiter);

function cacheable(res, maxAge = 30) {
  res.setHeader('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=120`);
}

router.get(
  '/sites/:slug',
  asyncHandler(async (req, res) => {
    const data = await publicSite(req.params.slug);
    cacheable(res);
    res.json({ data });
  }),
);

router.get(
  '/sites/:slug/pages/:pageSlug',
  asyncHandler(async (req, res) => {
    const data = await publicPage(req.params.slug, req.params.pageSlug);
    cacheable(res);
    res.json({ data });
  }),
);

router.get(
  '/sites/:slug/rooms',
  asyncHandler(async (req, res) => {
    const data = await publicRooms(req.params.slug);
    // Inventory changes far more often than editorial content.
    cacheable(res, 10);
    res.json({ data });
  }),
);

router.get(
  '/sites/:slug/availability',
  asyncHandler(async (req, res) => {
    const data = await availabilityForSite(req.params.slug, {
      arrival: String(req.query.arrival || ''),
      departure: String(req.query.departure || ''),
      guests: req.query.guests,
    });
    // Availability is the most time-sensitive public read.
    cacheable(res, 5);
    res.json({ data });
  }),
);

/**
 * Creates a real reservation in the existing engine: `pending`, unpaid, and
 * confirmed by staff in the dashboard. There is no online payment provider, so
 * the website never claims a charge was taken.
 */
router.post(
  '/sites/:slug/bookings',
  bookingLimiter,
  limitBookingBody,
  asyncHandler(async (req, res) => {
    const reservation = await createPublicBooking(req.params.slug, req.body || {});
    res.status(reservation.duplicate ? 200 : 201).json({ data: reservation });
  }),
);

router.get(
  '/media/:id',
  asyncHandler(async (req, res) => {
    const media = await publicMedia(req.params.id);
    const buffer = await mediaStorage().get(media.storageKey);
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    if (media.hash) res.setHeader('ETag', `"${media.hash.slice(0, 32)}"`);
    res.send(buffer);
  }),
);

export default router;
