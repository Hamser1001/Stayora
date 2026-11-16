import { Router } from 'express';
import { models } from '../db/models.js';
import { paymentPage } from '../services/listing.js';
import { paged, parseListQuery, searchRegex } from '../services/paging.js';
import { nextIdFor } from '../services/snapshot.js';
import { todayISO, monthStart } from '../lib/dates.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const CLOSED = ['cancelled', 'noShow'];
const ACTIVE = ['confirmed', 'checkedIn', 'pending'];

const round = (value) => Math.round(value * 100) / 100;

/** Sum of payments for one reservation, recomputed from the ledger. */
async function paidForReservation(reservationId) {
  const [row] = await models.Payment.aggregate([
    { $match: { reservationId } },
    {
      $group: {
        _id: null,
        total: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] } },
      },
    },
  ]);
  return round(row?.total || 0);
}

/** Outstanding balance across active reservations, computed in the database. */
async function outstandingTotal() {
  const [row] = await models.Reservation.aggregate([
    { $match: { status: { $in: ACTIVE } } },
    {
      $group: {
        _id: null,
        total: { $sum: { $max: [0, { $subtract: ['$total', { $ifNull: ['$paid', 0] }] }] } },
      },
    },
  ]);
  return round(row?.total || 0);
}

/* -------------------------------- Payments -------------------------------- */

export const paymentsRouter = Router();

paymentsRouter.use(requirePermission('payments'));

paymentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows, total, paging } = await paymentPage(req.query);
    res.json(paged(rows, { ...paging, total }));
  }),
);

paymentsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const reservation = await models.Reservation.findOne({ id: payload.reservationId }).lean();
    if (!reservation) fail('Choose a reservation.', 'RESERVATION_REQUIRED');

    const amount = Number(payload.amount);
    if (!(amount > 0)) fail('Enter an amount greater than zero.', 'INVALID_AMOUNT');

    const paid = await paidForReservation(reservation.id);
    const balance = Math.max(0, reservation.total - paid);
    if (amount > balance + 0.01) fail('The payment is higher than the outstanding balance.', 'OVERPAYMENT');

    const payment = await models.Payment.create({
      id: await nextIdFor('payment', models.Payment),
      reservationId: reservation.id,
      guestId: reservation.guestId,
      guestName: reservation.guestName,
      reservationReference: reservation.reference,
      roomNumber: reservation.roomNumber,
      amount,
      method: payload.method || 'card',
      type: 'payment',
      date: payload.date || todayISO(),
      reference: payload.reference || `PMT-${Date.now().toString().slice(-6)}`,
      notes: payload.notes || '',
      createdAt: new Date().toISOString(),
      createdBy: req.user?.name || '',
    });

    await models.Reservation.updateOne({ id: reservation.id }, { $inc: { paid: amount } });

    res.status(201).json({ data: { ...payment.toObject(), balanceAfter: Math.max(0, balance - amount) } });
  }),
);

paymentsRouter.post(
  '/refunds',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reservationId, amount, method } = req.body || {};
    const reservation = await models.Reservation.findOne({ id: reservationId }).lean();
    if (!reservation) fail('Reservation not found.', 'NOT_FOUND', 404);

    const paid = await paidForReservation(reservationId);
    const refundAmount = Number(amount);
    if (!(refundAmount > 0) || refundAmount > paid + 0.01) {
      fail('Refund exceeds the amount collected.', 'INVALID_REFUND');
    }

    const refund = await models.Payment.create({
      id: await nextIdFor('payment', models.Payment),
      reservationId,
      guestId: reservation.guestId,
      guestName: reservation.guestName,
      reservationReference: reservation.reference,
      roomNumber: reservation.roomNumber,
      amount: refundAmount,
      method: method || 'card',
      type: 'refund',
      date: todayISO(),
      reference: `RMB-${Date.now().toString().slice(-6)}`,
      notes: '',
      createdAt: new Date().toISOString(),
    });

    await models.Reservation.updateOne({ id: reservationId }, { $inc: { paid: -refundAmount } });

    res.status(201).json({ data: refund.toObject() });
  }),
);

paymentsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) fail('A start and end date are required.', 'VALIDATION_ERROR');
    const today = todayISO();

    const [ledger, outstanding, dueToday, month] = await Promise.all([
      models.Payment.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            collected: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, 0, '$amount'] } },
            refunds: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, '$amount', 0] } },
            count: { $sum: 1 },
          },
        },
      ]),
      outstandingTotal(),
      models.Reservation.aggregate([
        { $match: { arrival: today, status: { $nin: CLOSED } } },
        {
          $group: {
            _id: null,
            total: { $sum: { $max: [0, { $subtract: ['$total', { $ifNull: ['$paid', 0] }] }] } },
          },
        },
      ]),
      models.Payment.aggregate([
        { $match: { date: { $gte: monthStart(today) } } },
        {
          $group: {
            _id: null,
            total: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] } },
          },
        },
      ]),
    ]);

    const collected = round(ledger[0]?.collected || 0);
    const refunds = round(ledger[0]?.refunds || 0);
    const count = ledger[0]?.count || 0;

    res.json({
      data: {
        collected,
        refunds,
        net: round(collected - refunds),
        outstanding,
        dueToday: round(dueToday[0]?.total || 0),
        thisMonth: round(month[0]?.total || 0),
        count,
        avg: count ? round((collected - refunds) / count) : 0,
      },
    });
  }),
);

/* -------------------------------- Expenses -------------------------------- */

export const expensesRouter = Router();

expensesRouter.use(requirePermission('expenses'));

const EXPENSE_SORTS = ['date', 'amount', 'vendor', 'category'];

expensesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const paging = parseListQuery(req.query, {
      sortable: EXPENSE_SORTS,
      defaultSort: { date: -1 },
      defaultPageSize: 25,
    });

    const filter = {};
    if (req.query.category && req.query.category !== 'all') filter.category = String(req.query.category);
    if (req.query.from) filter.date = { ...(filter.date || {}), $gte: String(req.query.from) };
    if (req.query.to) filter.date = { ...(filter.date || {}), $lte: String(req.query.to) };
    const rx = searchRegex(req.query.search);
    if (rx) filter.$or = [{ vendor: rx }, { category: rx }];

    const [rows, total] = await Promise.all([
      models.Expense.find(filter).sort(paging.sortSpec).skip(paging.skip).limit(paging.pageSize).lean(),
      models.Expense.countDocuments(filter),
    ]);

    res.json(paged(rows, { ...paging, total }));
  }),
);

expensesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const vendor = String(payload.vendor || '').trim();
    if (!vendor) fail('Enter the vendor name.', 'VALIDATION_ERROR');
    if (!(Number(payload.amount) > 0)) fail('Enter an amount greater than zero.', 'INVALID_AMOUNT');
    if (!payload.category) fail('Choose a category.', 'VALIDATION_ERROR');

    const expense = await models.Expense.create({
      id: await nextIdFor('expense', models.Expense),
      category: payload.category,
      vendor,
      date: payload.date || todayISO(),
      amount: Number(payload.amount),
      method: payload.method || 'card',
      receipt: payload.receipt || '',
      notes: payload.notes || '',
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ data: expense.toObject() });
  }),
);

expensesRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await models.Expense.deleteOne({ id: req.params.id });
    if (!result.deletedCount) fail('Expense not found.', 'NOT_FOUND', 404);
    res.json({ data: { id: req.params.id } });
  }),
);

expensesRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) fail('A start and end date are required.', 'VALIDATION_ERROR');

    const [range, byCategory, month] = await Promise.all([
      models.Expense.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      models.Expense.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: '$category', amount: { $sum: '$amount' } } },
        { $sort: { amount: -1 } },
      ]),
      models.Expense.aggregate([
        { $match: { date: { $gte: monthStart(todayISO()) } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const total = round(range[0]?.total || 0);
    const count = range[0]?.count || 0;
    const categories = byCategory.map((row) => ({
      category: row._id,
      amount: Math.round(row.amount),
      share: total ? (row.amount / total) * 100 : 0,
    }));

    res.json({
      data: {
        total,
        count,
        avg: count ? round(total / count) : 0,
        largest: categories[0] || null,
        byCategory: categories,
        thisMonth: round(month[0]?.total || 0),
      },
    });
  }),
);
