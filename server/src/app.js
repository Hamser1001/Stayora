import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRouter from './routes/auth.js';
import reservationsRouter from './routes/reservations.js';
import { roomsRouter, bedsRouter, guestsRouter } from './routes/inventory.js';
import { paymentsRouter, expensesRouter } from './routes/finance.js';
import { housekeepingRouter } from './routes/operations.js';
import staffRouter from './routes/staff.js';
import dataRouter from './routes/data.js';
import {
  dashboardRouter,
  notificationsRouter,
  reportsRouter,
  settingsRouter,
} from './routes/insights.js';
import { errorHandler, notFound } from './middleware/error.js';
import { invalidate } from './services/cache.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.origins.length === 0 || env.origins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Origin not allowed by CORS.'));
      },
      credentials: true,
    }),
  );
  // Excel imports are sent as base64 in the JSON body.
  app.use(express.json({ limit: '12mb' }));

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
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/data', dataRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
