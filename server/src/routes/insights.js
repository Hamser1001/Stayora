import { Router } from 'express';
import { models } from '../db/models.js';
import { balanceStats, getSettings, loadAnalyticsDb, saveSettings } from '../services/snapshot.js';
import { enrichReservationRows } from '../services/listing.js';
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
import { requireAuth, requirePermission } from '../middleware/auth.js';

function requireRange(req) {
  const { start, end } = req.query;
  if (!start || !end) fail('A start and end date are required.', 'VALIDATION_ERROR');
  return { start, end };
}

/* -------------------------------- Dashboard ------------------------------- */

export const dashboardRouter = Router();

dashboardRouter.use(requirePermission('dashboard'));

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { start, end } = requireRange(req);
    const [db, balances] = await Promise.all([loadAnalyticsDb({ start, end }), balanceStats()]);
    db.tasks = [];
    const totals = {
      outstanding: balances.outstanding,
      outstandingCount: balances.outstandingCount,
      pendingReservations: balances.pendingReservations,
    };

    const previousStart = addDays(start, -diffDays(start, end) - 1);
    const previousEnd = addDays(start, -1);
    const previous = metricsForRange(db, previousStart, previousEnd, totals);
    const snapshot = dashboardSnapshot(db, start, end, totals);
    snapshot.live.openTasks = db.openTasks;

    // Recent activity is a top-N query on the createdAt index, not a full sort.
    const recentRows = await models.Reservation.find()
      .sort({ createdAt: -1, id: -1 })
      .limit(6)
      .lean();
    snapshot.recent = await enrichReservationRows(recentRows);

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

reportsRouter.use(requirePermission('reports'));

reportsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { start, end } = requireRange(req);
    const [db, balances] = await Promise.all([loadAnalyticsDb({ start, end }), balanceStats()]);

    const metrics = metricsForRange(db, start, end, { outstanding: balances.outstanding });
    const previousStart = addDays(start, -diffDays(start, end) - 1);
    const previous = metricsForRange(db, previousStart, addDays(start, -1), {
      outstanding: balances.outstanding,
    });
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

settingsRouter.use(requirePermission('settings'));

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

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 40));
    const list = await models.Notification.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ data: list });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await models.Notification.updateMany({ read: false }, { read: true });
    const list = await models.Notification.find().sort({ createdAt: -1 }).limit(40).lean();
    res.json({ data: list });
  }),
);
