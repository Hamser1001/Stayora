import { models } from '../db/models.js';
import { addDays, todayISO } from '../lib/dates.js';
import { memo } from './cache.js';

/**
 * Read models
 * -----------
 * The API never loads whole collections to answer a request. Each endpoint
 * asks for the slice it needs (a page, a date window, one bed) and relies on
 * the indexes declared in db/models.js.
 */

/** Small reference collections that are cheap to load once per request. */
export async function loadReferenceDb() {
  const [rooms, beds, staff, setting] = await Promise.all([
    models.Room.find().lean(),
    models.Bed.find().lean(),
    models.Staff.find().lean(),
    models.Setting.findOne({ key: 'workspace' }).lean(),
  ]);
  return { rooms, beds, staff, settings: setting?.data || {} };
}

/**
 * Analytics slice: rooms, beds and every reservation/payment/expense that can
 * influence a range report. Bounded by date indexes instead of collection size.
 */
export function loadAnalyticsDb({ start, end }) {
  // Dashboard and reports read the same window back to back; share one load.
  return memo(`analytics:${start}:${end}`, 8000, () => loadAnalyticsDbUncached({ start, end }));
}

async function loadAnalyticsDbUncached({ start, end }) {
  // Enough history for six-month report series and the previous period.
  const previousStart = addDays(start, -200);
  const today = todayISO();
  const [reference, guests, reservations, payments, expenses, openTasks] = await Promise.all([
    loadReferenceDb(),
    models.Guest.find({}, { id: 1, name: 1, email: 1, phone: 1, nationality: 1, _id: 0 }).lean(),
    models.Reservation.find({
      $or: [
        { arrival: { $lte: end }, departure: { $gt: start } },
        { status: { $in: ['confirmed', 'checkedIn', 'pending'] }, arrival: { $lte: today }, departure: { $gt: today } },
        { arrival: today },
      ],
    }).lean(),
    // Only the columns the analytics selectors read — keeps the transfer small.
    models.Payment.find(
      { date: { $gte: previousStart, $lte: end } },
      { id: 1, date: 1, amount: 1, type: 1, method: 1, _id: 0 },
    ).lean(),
    models.Expense.find(
      { date: { $gte: previousStart, $lte: end } },
      { id: 1, date: 1, amount: 1, category: 1, _id: 0 },
    ).lean(),
    models.Task.countDocuments({ status: { $ne: 'completed' } }),
  ]);

  return { ...reference, guests, reservations, payments, expenses, openTasks };
}

/** Portfolio-wide balance/pending counters, computed in one indexed aggregation. */
export async function balanceStats() {
  const [row] = await models.Reservation.aggregate([
    { $match: { status: { $in: ['confirmed', 'checkedIn', 'pending'] } } },
    {
      $group: {
        _id: null,
        outstanding: {
          $sum: { $max: [0, { $subtract: ['$total', { $ifNull: ['$paid', 0] }] }] },
        },
        outstandingCount: {
          $sum: {
            $cond: [
              { $gt: [{ $subtract: ['$total', { $ifNull: ['$paid', 0] }] }, 0.009] },
              1,
              0,
            ],
          },
        },
        pendingReservations: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
      },
    },
  ]);
  return {
    outstanding: Math.round((row?.outstanding || 0) * 100) / 100,
    outstandingCount: row?.outstandingCount || 0,
    pendingReservations: row?.pendingReservations || 0,
  };
}

/**
 * Saved values are returned exactly as stored. An unset currency falls back to
 * the base currency, but a stored choice is never swapped for a default here:
 * that silently reverted valid preferences.
 */
export async function getSettings() {
  const setting = await models.Setting.findOne({ key: 'workspace' }).lean();
  const data = setting?.data || {};
  const baseCurrency = data.baseCurrency || 'EUR';
  return {
    ...data,
    baseCurrency,
    currency: data.currency || baseCurrency,
  };
}

const UNSAFE_SETTING_KEYS = new Set(['key', 'data', '_id', '__proto__', 'constructor', 'prototype']);

/**
 * Applies a partial settings update.
 *
 * Only the keys actually sent are written, as individual `data.<key>` paths, so
 * saving one section never replaces the rest of the document and two people
 * saving different sections at the same time do not overwrite each other.
 * Notification flags are merged one by one for the same reason.
 */
export async function saveSettings(patch) {
  const set = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined || UNSAFE_SETTING_KEYS.has(key)) continue;
    if (key === 'notifications') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [flag, enabled] of Object.entries(value)) {
          if (!UNSAFE_SETTING_KEYS.has(flag)) {
            set[`data.notifications.${flag}`] = Boolean(enabled);
          }
        }
      }
      continue;
    }
    set[`data.${key}`] = value;
  }

  // Nothing to write: never create or blank a settings document by accident.
  if (Object.keys(set).length === 0) return getSettings();

  const setting = await models.Setting.findOneAndUpdate(
    { key: 'workspace' },
    { $set: { key: 'workspace', ...set } },
    { new: true, upsert: true, lean: true },
  );
  const data = setting?.data || {};
  const baseCurrency = data.baseCurrency || 'EUR';
  return { ...data, baseCurrency, currency: data.currency || baseCurrency };
}

/**
 * Allocate the next string id from a counter document. Seeded databases start
 * the counter at the highest existing id, so this is O(1) per write.
 */
const COUNTER_PREFIX = {
  reservation: 'res',
  guest: 'gst',
  payment: 'pay',
  expense: 'exp',
  task: 'tsk',
  staff: 'stf',
  notification: 'ntf',
  room: 'rom',
};

async function initialiseCounter(key, model) {
  const prefix = COUNTER_PREFIX[key];
  const docs = await model.find({ id: new RegExp(`^${prefix}_\\d+$`) }, { id: 1, _id: 0 }).lean();
  const max = docs.reduce((highest, doc) => {
    const numeric = Number(String(doc.id).slice(prefix.length + 1));
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest;
  }, 0);
  await models.Counter.updateOne({ key }, { $max: { value: max } }, { upsert: true });
  return max;
}

export async function nextIdFor(key, model) {
  const prefix = COUNTER_PREFIX[key];
  const counter = await models.Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { new: true, upsert: true, lean: true },
  ).catch(() => null);

  if (counter && counter.value > 1) return `${prefix}_${counter.value}`;

  const max = await initialiseCounter(key, model);
  const next = max + 1;
  await models.Counter.updateOne({ key }, { $set: { value: next } });
  return `${prefix}_${next}`;
}

export async function syncCounters() {
  await models.Counter.deleteMany({});
  await Promise.all([
    initialiseCounter('reservation', models.Reservation),
    initialiseCounter('guest', models.Guest),
    initialiseCounter('payment', models.Payment),
    initialiseCounter('expense', models.Expense),
    initialiseCounter('task', models.Task),
    initialiseCounter('staff', models.Staff),
    initialiseCounter('notification', models.Notification),
    initialiseCounter('room', models.Room),
  ]);
}

export function reservationReference(sequence) {
  return `STY-${(1042 + sequence * 37).toString(36).toUpperCase().padStart(5, '0')}`;
}

export function nextReservationSequence(counterValue) {
  return counterValue;
}

export const CLOSED_STATUSES = ['cancelled', 'noShow'];
export const ACTIVE_STATUSES = ['confirmed', 'checkedIn', 'pending'];

export function today() {
  return todayISO();
}
