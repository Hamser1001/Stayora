import { Router } from 'express';
import { models } from '../db/models.js';
import { loadSnapshot, nextId } from '../services/snapshot.js';
import { expenseBreakdown } from '../services/selectors.js';
import { todayISO } from '../lib/dates.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

const CANCELLED = ['cancelled', 'noShow'];

function paidTotal(reservationId, payments) {
  return payments
    .filter((payment) => payment.reservationId === reservationId)
    .reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amount : payment.amount), 0);
}

/* -------------------------------- Payments -------------------------------- */

export const paymentsRouter = Router();

paymentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const { search, method, from, to } = req.query;

    let list = db.payments.map((payment) => {
      const reservation = db.reservations.find((item) => item.id === payment.reservationId);
      const guest = db.guests.find((item) => item.id === reservation?.guestId);
      return {
        ...payment,
        guestName: guest?.name || '—',
        reservationReference: reservation?.reference || '—',
        roomNumber: db.rooms.find((item) => item.id === reservation?.roomId)?.number || '—',
      };
    });

    if (search) {
      const term = String(search).toLowerCase();
      list = list.filter(
        (payment) =>
          payment.guestName.toLowerCase().includes(term) ||
          payment.reference.toLowerCase().includes(term) ||
          payment.reservationReference.toLowerCase().includes(term),
      );
    }
    if (method && method !== 'all') list = list.filter((payment) => payment.method === method);
    if (from) list = list.filter((payment) => payment.date >= from);
    if (to) list = list.filter((payment) => payment.date <= to);

    list.sort(
      (a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)),
    );
    res.json({ data: list });
  }),
);

paymentsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const db = await loadSnapshot();
    const reservation = db.reservations.find((item) => item.id === payload.reservationId);
    if (!reservation) fail('Choose a reservation.', 'RESERVATION_REQUIRED');

    const amount = Number(payload.amount);
    if (!(amount > 0)) fail('Enter an amount greater than zero.', 'INVALID_AMOUNT');

    const paid = paidTotal(reservation.id, db.payments);
    const balance = Math.max(0, reservation.total - paid);
    if (amount > balance + 0.01) fail('The payment is higher than the outstanding balance.', 'OVERPAYMENT');

    const payment = await models.Payment.create({
      id: nextId('pay', db.payments),
      reservationId: reservation.id,
      guestId: reservation.guestId,
      amount,
      method: payload.method || 'card',
      type: 'payment',
      date: payload.date || todayISO(),
      reference: payload.reference || `PMT-${Date.now().toString().slice(-6)}`,
      notes: payload.notes || '',
      createdAt: new Date().toISOString(),
      createdBy: req.user?.name || '',
    });

    res.status(201).json({ data: { ...payment.toObject(), balanceAfter: Math.max(0, balance - amount) } });
  }),
);

paymentsRouter.post(
  '/refunds',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reservationId, amount, method } = req.body || {};
    const db = await loadSnapshot();
    const reservation = db.reservations.find((item) => item.id === reservationId);
    if (!reservation) fail('Reservation not found.', 'NOT_FOUND', 404);

    const paid = paidTotal(reservationId, db.payments);
    const refundAmount = Number(amount);
    if (!(refundAmount > 0) || refundAmount > paid + 0.01) {
      fail('Refund exceeds the amount collected.', 'INVALID_REFUND');
    }

    const refund = await models.Payment.create({
      id: nextId('pay', db.payments),
      reservationId,
      guestId: reservation.guestId,
      amount: refundAmount,
      method: method || 'card',
      type: 'refund',
      date: todayISO(),
      reference: `RMB-${Date.now().toString().slice(-6)}`,
      notes: '',
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ data: refund.toObject() });
  }),
);

paymentsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) fail('A start and end date are required.', 'VALIDATION_ERROR');

    const db = await loadSnapshot();
    const list = db.payments.filter((payment) => payment.date >= start && payment.date <= end);
    const collected = list
      .filter((payment) => payment.type === 'payment')
      .reduce((sum, payment) => sum + payment.amount, 0);
    const refunds = list
      .filter((payment) => payment.type === 'refund')
      .reduce((sum, payment) => sum + payment.amount, 0);

    const outstanding = db.reservations
      .filter((reservation) => ['confirmed', 'checkedIn', 'pending'].includes(reservation.status))
      .reduce((sum, reservation) => {
        const paid = paidTotal(reservation.id, db.payments);
        return sum + Math.max(0, reservation.total - paid);
      }, 0);

    const today = todayISO();
    const dueToday = db.reservations
      .filter((reservation) => reservation.arrival === today && !CANCELLED.includes(reservation.status))
      .reduce((sum, reservation) => {
        const paid = paidTotal(reservation.id, db.payments);
        return sum + Math.max(0, reservation.total - paid);
      }, 0);

    res.json({
      data: {
        collected,
        refunds,
        net: collected - refunds,
        outstanding: Math.round(outstanding),
        dueToday: Math.round(dueToday),
        count: list.length,
        avg: list.length ? (collected - refunds) / list.length : 0,
      },
    });
  }),
);

/* -------------------------------- Expenses -------------------------------- */

export const expensesRouter = Router();

expensesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const { search, category, from, to } = req.query;
    let list = [...db.expenses];

    if (search) {
      const term = String(search).toLowerCase();
      list = list.filter(
        (expense) =>
          expense.vendor.toLowerCase().includes(term) || expense.category.toLowerCase().includes(term),
      );
    }
    if (category && category !== 'all') {
      list = list.filter((expense) => expense.category === category);
    }
    if (from) list = list.filter((expense) => expense.date >= from);
    if (to) list = list.filter((expense) => expense.date <= to);

    list.sort((a, b) => b.date.localeCompare(a.date));
    res.json({ data: list });
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

    const db = await loadSnapshot();
    const expense = await models.Expense.create({
      id: nextId('exp', db.expenses),
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

    const db = await loadSnapshot();
    const list = db.expenses.filter((expense) => expense.date >= start && expense.date <= end);
    const total = list.reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = expenseBreakdown(db, start, end);

    res.json({
      data: {
        total,
        count: list.length,
        avg: list.length ? total / list.length : 0,
        largest: byCategory[0] || null,
        byCategory,
      },
    });
  }),
);
