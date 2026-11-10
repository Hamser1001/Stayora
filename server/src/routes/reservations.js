import { Router } from 'express';
import { models } from '../db/models.js';
import { loadSnapshot, nextId } from '../services/snapshot.js';
import { bedStatus, enrichReservation } from '../services/selectors.js';
import { addDays, nightsBetween, todayISO } from '../lib/dates.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

const CANCELLED = ['cancelled', 'noShow'];

const router = Router();

function reservationTotal({ rate, arrival, departure, discount = 0 }) {
  return Math.max(0, nightsBetween(arrival, departure) * rate - discount);
}

function hasOverlap(db, { bedId, arrival, departure, excludeId }) {
  return db.reservations.some(
    (reservation) =>
      reservation.bedId === bedId &&
      reservation.id !== excludeId &&
      !CANCELLED.includes(reservation.status) &&
      reservation.arrival < departure &&
      arrival < reservation.departure,
  );
}

function referenceFor(db) {
  let attempt = db.reservations.length + 1;
  const make = (value) => `STY-${(1042 + value * 37).toString(36).toUpperCase().padStart(5, '0')}`;
  let reference = make(attempt);
  while (db.reservations.some((reservation) => reservation.reference === reference)) {
    attempt += 1;
    reference = make(attempt);
  }
  return reference;
}

function sortReservations(list) {
  const rank = { checkedIn: 0, confirmed: 1, pending: 2, checkedOut: 3, noShow: 4, cancelled: 5 };
  return list.sort((a, b) => {
    const byStatus = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    return b.arrival.localeCompare(a.arrival);
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const { search, status, source, from, to, roomId } = req.query;
    let list = db.reservations.map((reservation) => enrichReservation(reservation, db));

    if (search) {
      const term = String(search).toLowerCase();
      list = list.filter(
        (reservation) =>
          reservation.reference.toLowerCase().includes(term) ||
          reservation.guestName.toLowerCase().includes(term) ||
          reservation.roomNumber.toLowerCase().includes(term),
      );
    }
    if (status && status !== 'all') list = list.filter((reservation) => reservation.status === status);
    if (source && source !== 'all') list = list.filter((reservation) => reservation.source === source);
    if (from) list = list.filter((reservation) => reservation.departure > from);
    if (to) list = list.filter((reservation) => reservation.arrival < addDays(to, 1));
    if (roomId) list = list.filter((reservation) => reservation.roomId === roomId);

    sortReservations(list);
    res.json({ data: list });
  }),
);

router.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) fail('A start and end date are required.', 'VALIDATION_ERROR');
    const db = await loadSnapshot();
    const reservations = db.reservations
      .filter(
        (reservation) =>
          !CANCELLED.includes(reservation.status) &&
          reservation.arrival < addDays(end, 1) &&
          reservation.departure > start,
      )
      .map((reservation) => enrichReservation(reservation, db));
    res.json({ data: { reservations, start, end } });
  }),
);

router.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const { arrival, departure, roomId } = req.query;
    if (!arrival || !departure || departure <= arrival) return res.json({ data: [] });

    const db = await loadSnapshot();
    const occupied = new Set(
      db.reservations
        .filter(
          (reservation) =>
            !CANCELLED.includes(reservation.status) &&
            reservation.arrival < departure &&
            arrival < reservation.departure,
        )
        .map((reservation) => reservation.bedId),
    );

    const beds = db.beds
      .filter((bed) => (roomId ? bed.roomId === roomId : true))
      .filter((bed) => !bed.maintenance && !bed.outOfService && !occupied.has(bed.id))
      .map((bed) => {
        const room = db.rooms.find((item) => item.id === bed.roomId);
        return {
          id: bed.id,
          label: bed.label,
          roomId: room.id,
          roomNumber: room.number,
          roomType: room.type,
          audience: room.audience,
          floor: room.floor,
          pricePerBed: room.pricePerBed,
          status: bedStatus(bed, db),
        };
      })
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

    res.json({ data: beds });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const reservation = db.reservations.find((item) => item.id === req.params.id);
    if (!reservation) fail('Reservation not found.', 'NOT_FOUND', 404);
    res.json({ data: enrichReservation(reservation, db) });
  }),
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const { arrival, departure, guestId, roomId, bedId, source, guests } = payload;
    if (!arrival || !departure || departure <= arrival) {
      fail('Departure must be after arrival.', 'INVALID_DATES');
    }

    const db = await loadSnapshot();
    const guest = db.guests.find((item) => item.id === guestId);
    if (!guest) fail('Select a guest for this reservation.', 'GUEST_REQUIRED');

    const room = db.rooms.find((item) => item.id === roomId);
    const bed = db.beds.find((item) => item.id === bedId && item.roomId === roomId);
    if (!room || !bed) fail('Select an available bed.', 'BED_REQUIRED');
    if (bed.maintenance || bed.outOfService) fail('That bed is not available for booking.', 'BED_UNAVAILABLE');
    if (hasOverlap(db, { bedId, arrival, departure })) {
      fail('This bed is already booked for the selected dates.', 'BED_OVERLAP', 409);
    }

    const roomBeds = db.beds.filter((item) => item.roomId === roomId).length;
    if (Number(guests) > Math.max(1, roomBeds)) {
      fail('This room cannot host that many guests.', 'TOO_MANY_GUESTS');
    }

    const rate = Number(payload.rate) || room.pricePerBed;
    const discount = Number(payload.discount) || 0;
    const total = reservationTotal({ rate, arrival, departure, discount });

    const reservation = await models.Reservation.create({
      id: nextId('res', db.reservations),
      reference: referenceFor(db),
      guestId,
      roomId,
      bedId,
      arrival,
      departure,
      guests: Number(guests) || 1,
      rate,
      discount,
      total,
      source: source || 'direct',
      status: payload.status || 'confirmed',
      notes: payload.notes || '',
      createdAt: new Date().toISOString(),
      createdBy: req.user?.name || '',
    });

    const deposit = Number(payload.deposit) || 0;
    if (deposit > 0) {
      await models.Payment.create({
        id: nextId('pay', db.payments),
        reservationId: reservation.id,
        guestId,
        amount: Math.min(deposit, total),
        method: payload.depositMethod || 'card',
        type: 'payment',
        date: todayISO(),
        reference: `PMT-${Date.now().toString().slice(-6)}`,
        createdAt: new Date().toISOString(),
      });
    }

    const fresh = await loadSnapshot();
    res
      .status(201)
      .json({ data: enrichReservation(fresh.reservations.find((item) => item.id === reservation.id), fresh) });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const db = await loadSnapshot();
    const reservation = db.reservations.find((item) => item.id === req.params.id);
    if (!reservation) fail('Reservation not found.', 'NOT_FOUND', 404);
    if (!['pending', 'confirmed'].includes(reservation.status)) {
      fail('Only pending or confirmed reservations can be edited.', 'INVALID_STATUS');
    }

    const next = {
      ...reservation,
      ...payload,
      rate: Number(payload.rate ?? reservation.rate),
      discount: Number(payload.discount ?? reservation.discount),
      guests: Number(payload.guests ?? reservation.guests),
    };
    if (next.departure <= next.arrival) fail('Departure must be after arrival.', 'INVALID_DATES');
    if (
      hasOverlap(db, {
        bedId: next.bedId,
        arrival: next.arrival,
        departure: next.departure,
        excludeId: reservation.id,
      })
    ) {
      fail('This bed is already booked for the selected dates.', 'BED_OVERLAP', 409);
    }
    next.total = reservationTotal(next);

    await models.Reservation.updateOne(
      { id: reservation.id },
      {
        guestId: next.guestId,
        roomId: next.roomId,
        bedId: next.bedId,
        arrival: next.arrival,
        departure: next.departure,
        guests: next.guests,
        rate: next.rate,
        discount: next.discount,
        total: next.total,
        source: next.source,
        notes: next.notes || '',
        updatedAt: new Date().toISOString(),
      },
    );

    const fresh = await loadSnapshot();
    res.json({ data: enrichReservation(fresh.reservations.find((item) => item.id === reservation.id), fresh) });
  }),
);

router.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    const db = await loadSnapshot();
    const reservation = db.reservations.find((item) => item.id === req.params.id);
    if (!reservation) fail('Reservation not found.', 'NOT_FOUND', 404);

    const transitions = {
      confirmed: ['pending'],
      checkedIn: ['pending', 'confirmed'],
      checkedOut: ['checkedIn'],
      cancelled: ['pending', 'confirmed'],
      noShow: ['pending', 'confirmed'],
    };
    if (!(transitions[status] || []).includes(reservation.status)) {
      fail(`Cannot move a ${reservation.status} reservation to ${status}.`, 'INVALID_TRANSITION');
    }

    const bed = db.beds.find((item) => item.id === reservation.bedId);
    const patch = { status, updatedAt: new Date().toISOString() };

    if (status === 'checkedIn') {
      const occupied = db.reservations.some(
        (item) =>
          item.bedId === reservation.bedId && item.id !== reservation.id && item.status === 'checkedIn',
      );
      if (occupied) fail('That bed is already occupied.', 'BED_OCCUPIED', 409);
      if (bed?.maintenance || bed?.outOfService) fail('That bed is out of service.', 'BED_UNAVAILABLE');
      if (bed) await models.Bed.updateOne({ id: bed.id }, { cleaning: false });
      patch.checkedInAt = new Date().toISOString();
    }
    if (status === 'checkedOut') {
      if (bed) await models.Bed.updateOne({ id: bed.id }, { cleaning: true });
      patch.checkedOutAt = new Date().toISOString();
    }

    await models.Reservation.updateOne({ id: reservation.id }, patch);
    const fresh = await loadSnapshot();
    res.json({ data: enrichReservation(fresh.reservations.find((item) => item.id === reservation.id), fresh) });
  }),
);

export default router;
