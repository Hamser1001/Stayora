import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import authRouter from './routes/auth.js';
import reservationsRouter from './routes/reservations.js';
import { roomsRouter, bedsRouter, guestsRouter } from './routes/inventory.js';
import { paymentsRouter, expensesRouter } from './routes/finance.js';
import { housekeepingRouter } from './routes/operations.js';
import staffRouter from './routes/staff.js';
import dataRouter from './routes/data.js';
import integrationsRouter from './routes/integrations.js';
import cmsRouter from './routes/cms.js';
import publicRouter from './routes/public.js';
import currencyRouter from './routes/currency.js';
import {
  dashboardRouter,
  notificationsRouter,
  reportsRouter,
  settingsRouter,
} from './routes/insights.js';
import { errorHandler, notFound } from './middleware/error.js';
import { invalidate } from './services/cache.js';

// Dev servers move between localhost, 127.0.0.1 and [::1] and between ports, and
// a rejected origin reaches the UI as "Network error", so loopback is trusted
// outside production regardless of the configured CLIENT_ORIGINS list.
const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.origins.length === 0 || env.origins.includes(origin)) {
          return callback(null, true);
        }
        if (!env.isProduction && LOOPBACK_ORIGIN.test(origin)) {
          return callback(null, true);
        }
        console.warn(`CORS blocked origin: ${origin}`);
        return callback(new Error('Origin not allowed by CORS.'));
      },
      credentials: true,
    }),
  );
  // Excel imports and avatar uploads are sent as base64 in the JSON body.
  // Inbound webhook payloads keep their exact bytes: the signature is computed
  // over the raw body, never over a re-serialised object.
  app.use(
    express.json({
      limit: '12mb',
      verify: (req, res, buf) => {
        if (req.originalUrl?.startsWith('/api/integrations/inbound/')) {
          req.rawBody = buf.toString('utf8');
        }
      },
    }),
  );

  // Profile photos: random, immutable filenames served with strict nosniff.
  const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');
  app.use(
    '/uploads',
    (req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(uploadsDir, {
      index: false,
      dotfiles: 'deny',
      maxAge: '30d',
      immutable: true,
      fallthrough: true,
    }),
  );

  // Any mutation invalidates the short-lived read caches (counters, analytics).
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') invalidate();
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ data: { status: 'ok', uptime: process.uptime() } });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/beds', bedsRouter);
  app.use('/api/guests', guestsRouter);
  app.use('/api/reservations', reservationsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/housekeeping', housekeepingRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/currency', currencyRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/cms', cmsRouter);
  // Content the public website consumes: published pages and public media only.
  app.use('/api/public', publicRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
