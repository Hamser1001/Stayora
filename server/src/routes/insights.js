import { Router } from 'express';
import { models } from '../db/models.js';
import { getSettings, loadSnapshot, saveSettings } from '../services/snapshot.js';
import {
  cashflowSeries,
  dashboardSnapshot,
  expenseBreakdown,
  metricsForRange,
  monthlySeries,
  occupancySeries,
  percentChange,
  roomTypePerformance,
  sourceBreakdown,
} from '../services/selectors.js';
import { addDays, diffDays } from '../lib/dates.js';
import { seedDatabase } from '../db/seed.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

function requireRange(req) {
  const { start, end } = req.query;
  if (!start || !end) fail('A start and end date are required.', 'VALIDATION_ERROR');
  return { start, end };
}

/* -------------------------------- Dashboard ------------------------------- */

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { start, end } = requireRange(req);
    const db = await loadSnapshot();

    const previousStart = addDays(start, -diffDays(start, end) - 1);
    const previousEnd = addDays(start, -1);
    const previous = metricsForRange(db, previousStart, previousEnd);
    const snapshot = dashboardSnapshot(db, start, end);

    res.json({
      data: {
        ...snapshot,
        series: cashflowSeries(db, start, end),
        occupancy: occupancySeries(db, start, end),
        sources: sourceBreakdown(db, start, end),
        previous,
        deltas: {
          revenue: percentChange(snapshot.metrics.revenue, previous.revenue),
          expenses: percentChange(snapshot.metrics.expenses, previous.expenses),
          occupancy: snapshot.live.occupancy - previous.occupancy,
          adr: percentChange(snapshot.metrics.adr, previous.adr),
        },
      },
    });
  }),
);

/* --------------------------------- Reports -------------------------------- */

export const reportsRouter = Router();

reportsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { start, end } = requireRange(req);
    const db = await loadSnapshot();

    const metrics = metricsForRange(db, start, end);
    const previousStart = addDays(start, -diffDays(start, end) - 1);
    const previous = metricsForRange(db, previousStart, addDays(start, -1));
    const types = roomTypePerformance(db, start, end);
    const expenses = expenseBreakdown(db, start, end);
    const strongest = [...types].sort((a, b) => b.occupancy - a.occupancy)[0];

    res.json({
      data: {
        metrics,
        previous,
        deltas: {
          revenue: percentChange(metrics.revenue, previous.revenue),
          expenses: percentChange(metrics.expenses, previous.expenses),
          netProfit: percentChange(metrics.netProfit, previous.netProfit),
          occupancy: metrics.occupancy - previous.occupancy,
          adr: percentChange(metrics.adr, previous.adr),
          revpar: percentChange(metrics.revpar, previous.revpar),
          avgStay: percentChange(metrics.avgStay, previous.avgStay),
          cancellationRate: metrics.cancellationRate - previous.cancellationRate,
        },
        monthly: monthlySeries(db, 6),
        types,
        expenses,
        insight: {
          strongestType: strongest?.type || null,
          strongestOccupancy: strongest?.occupancy || 0,
          outstanding: metrics.outstanding,
          largestCategory: expenses[0]?.category || null,
        },
      },
    });
  }),
);

/* -------------------------------- Settings -------------------------------- */

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await getSettings() });
  }),
);

settingsRouter.patch(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = await getSettings();
    const next = { ...current, ...(req.body || {}) };
    res.json({ data: await saveSettings(next) });
  }),
);

settingsRouter.post(
  '/reset',
  requireAuth,
  asyncHandler(async (req, res) => {
    await seedDatabase();
    res.json({ data: await getSettings() });
  }),
);

/* ------------------------------ Notifications ----------------------------- */

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const list = await models.Notification.find().lean();
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ data: list });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await models.Notification.updateMany({}, { read: true });
    const list = await models.Notification.find().lean();
    res.json({ data: list });
  }),
);
