import { connectDatabase, disconnectDatabase } from '../src/db/connect.js';
import { models } from '../src/db/models.js';
import { loadAnalyticsDb } from '../src/services/snapshot.js';
import { dashboardSnapshot, metricsForRange } from '../src/services/selectors.js';

/** Times the database round-trips behind dashboard/reports so regressions are visible. */
const start = new Date();
const rangeStart = new Date(start.getFullYear(), start.getMonth(), 1).toISOString().slice(0, 10);
const rangeEnd = start.toISOString().slice(0, 10);
const since = new Date(start.getTime() - 200 * 86400000).toISOString().slice(0, 10);

async function time(label, fn) {
  const started = performance.now();
  const value = await fn();
  console.log(`${label.padEnd(42)} ${Math.round(performance.now() - started)}ms  ${Array.isArray(value) ? `${value.length} docs` : ''}`);
  return value;
}

await connectDatabase();

await time('guests (projected)', () => models.Guest.find({}, { id: 1, name: 1, _id: 0 }).lean());
await time('rooms + beds', () => models.Room.find().lean());
await time('beds', () => models.Bed.find().lean());
await time('staff', () => models.Staff.find().lean());
await time('reservations in analytics window', () =>
  models.Reservation.find({
    $or: [
      { arrival: { $lte: rangeEnd }, departure: { $gt: rangeStart } },
      { status: { $in: ['confirmed', 'checkedIn', 'pending'] } },
      { arrival: { $gte: rangeStart, $lte: rangeEnd } },
    ],
  }).lean(),
);
await time('reservations overlapping only', () =>
  models.Reservation.find({ arrival: { $lte: rangeEnd }, departure: { $gt: rangeStart } }).lean(),
);
await time('reservations active only', () =>
  models.Reservation.find({ status: { $in: ['confirmed', 'checkedIn', 'pending'] } }).lean(),
);
await time('reservations today window', () =>
  models.Reservation.find({ arrival: { $lte: rangeEnd }, departure: { $gt: rangeEnd } }).lean(),
);
await time('payments since', () => models.Payment.find({ date: { $gte: since, $lte: rangeEnd } }).lean());
await time('payments projected since', () =>
  models.Payment.find({ date: { $gte: since, $lte: rangeEnd } }, { date: 1, amount: 1, type: 1, method: 1, _id: 0 }).lean(),
);
await time('expenses since', () => models.Expense.find({ date: { $gte: since, $lte: rangeEnd } }).lean());

const db = await time('loadAnalyticsDb (combined)', () => loadAnalyticsDb({ start: rangeStart, end: rangeEnd }));
db.tasks = [];
await time('metricsForRange', async () => [metricsForRange(db, rangeStart, rangeEnd)]);
await time('dashboardSnapshot', async () => [dashboardSnapshot(db, rangeStart, rangeEnd)]);

await disconnectDatabase();
