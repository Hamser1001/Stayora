import { Router } from 'express';
import { models } from '../db/models.js';
import { enrichReservationRows, reservationPage } from '../services/listing.js';
import { paged } from '../services/paging.js';
import { nextIdFor, reservationReference } from '../services/snapshot.js';
import { enrichReservation } from '../services/selectors.js';
import { addDays, nightsBetween, todayISO } from '../lib/dates.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const CANCELLED = ['cancelled', 'noShow'];

const router = Router();

router.use(requirePermission('reservations'));

function reservationTotal({ rate, arrival, departure, discount = 0 }) {
  return Math.max(0, nightsBetween(arrival, departure) * rate - discount);
}

/** Single indexed lookup instead of scanning every reservation of the workspace. */
async function findOverlap({ bedId, arrival, departure, excludeId }) {
  return models.Reservation.findOne({
    bedId,
    ...(excludeId ? { id: { $ne: excludeId } } : {}),
    status: { $nin: CANCELLED },
    arrival: { $lt: departure },
    departure: { $gt: arrival },
  })
    .select({ id: 1 })
    .lean();
}

async function reservationById(id) {
  const row = await models.Reservation.findOne({ id }).lean();
  if (!row) return null;
  const [enriched] = await enrichReservationRows([row]);
  return enriched;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows, total, counts, paging } = await reservationPage(req.query);
    res.json(paged(rows, { ...paging, total, counts }));
  }),
);

router.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) fail('A start and end date are required.', 'VALIDATION_ERROR');

    // Only reservations overlapping the visible window leave the database.
    const rows = await models.Reservation.find({
      status: { $nin: CANCELLED },
      arrival: { $lt: addDays(end, 1) },
      departure: { $gt: start },
    })
      .sort({ arrival: 1 })
      .lean();

    const reservations = await enrichReservationRows(rows);
    res.json({ data: { reservations, start, end } });
  }),
);

router.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const { arrival, departure, roomId } = req.query;
    if (!arrival || !departure || departure <= arrival) return res.json({ data: [] });

    const [occupiedBedIds, beds] = await Promise.all([
      models.Reservation.distinct('bedId', {
        status: { $nin: CANCELLED },
        arrival: { $lt: departure },
        departure: { $gt: arrival },
      }),
      models.Bed.find(roomId ? { roomId } : { maintenance: false, outOfService: false }).lean(),
    ]);

    const occupied = new Set(occupiedBedIds);
    const available = beds.filter((bed) => !bed.maintenance && !bed.outOfService && !occupied.has(bed.id));
    const rooms = await models.Room.find({ id: { $in: [...new Set(available.map((bed) => bed.roomId))] } }).lean();
    const roomMap = new Map(rooms.map((room) => [room.id, room]));

    const data = available
      .map((bed) => {
        const room = roomMap.get(bed.roomId);
        if (!room) return null;
        return {
          id: bed.id,
          label: bed.label,
          roomId: room.id,
          roomNumber: room.number,
          roomType: room.type,
          audience: room.audience,
          floor: room.floor,
          pricePerBed: room.pricePerBed,
          status: bed.cleaning ? 'cleaning' : 'available',
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

    res.json({ data });
  }),
);

/** Reservations that still carry a balance — powers the payment picker. */
router.get(
  '/outstanding',
  asyncHandler(async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 200));
    const rows = await models.Reservation.find({
      status: { $in: ['pending', 'confirmed', 'checkedIn'] },
      $expr: { $gt: ['$total', { $ifNull: ['$paid', 0] }] },
    })
      .sort({ arrival: 1 })
      .limit(limit)
      .lean();
    res.json({ data: await enrichReservationRows(rows) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const reservation = await reservationById(req.params.id);
    if (!reservation) fail('Reservation not found.', 'NOT_FOUND', 404);
    res.json({ data: reservation });
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

    const [guest, room, bed] = await Promise.all([
      models.Guest.findOne({ id: guestId }).lean(),
      models.Room.findOne({ id: roomId }).lean(),
      models.Bed.findOne({ id: bedId, roomId }).lean(),
    ]);
    if (!guest) fail('Select a guest for this reservation.', 'GUEST_REQUIRED');
    if (!room || !bed) fail('Select an available bed.', 'BED_REQUIRED');
    if (bed.maintenance || bed.outOfService) fail('That bed is not available for booking.', 'BED_UNAVAILABLE');
    if (await findOverlap({ bedId, arrival, departure })) {
      fail('This bed is already booked for the selected dates.', 'BED_OVERLAP', 409);
    }

    const roomBeds = await models.Bed.countDocuments({ roomId });
    if (Number(guests) > Math.max(1, roomBeds)) {
      fail('This room cannot host that many guests.', 'TOO_MANY_GUESTS');
    }

    const rate = Number(payload.rate) || room.pricePerBed;
    const discount = Number(payload.discount) || 0;
    const total = reservationTotal({ rate, arrival, departure, discount });

    const id = await nextIdFor('reservation', models.Reservation);
    const sequence = Number(String(id).split('_')[1]) || 1;

    const reservation = await models.Reservation.create({
      id,
      reference: reservationReference(sequence),
      guestId,
      roomId,
      bedId,
      arrival,
      departure,
      guests: Number(guests) || 1,
      rate,
      discount,
      total,
      paid: 0,
      source: source || 'direct',
      status: payload.status || 'confirmed',
      notes: payload.notes || '',
      createdAt: new Date().toISOString(),
      createdBy: req.user?.name || '',
      guestName: guest.name,
      roomNumber: room.number,
      bedLabel: bed.label,
    });

    const deposit = Number(payload.deposit) || 0;
    if (deposit > 0) {
      const amount = Math.min(deposit, total);
      await Promise.all([
        models.Payment.create({
          id: await nextIdFor('payment', models.Payment),
          reservationId: reservation.id,
          guestId,
          guestName: guest.name,
          reservationReference: reservation.reference,
          roomNumber: room.number,
          amount,
          method: payload.depositMethod || 'card',
          type: 'payment',
          date: todayISO(),
          reference: `PMT-${Date.now().toString().slice(-6)}`,
          createdAt: new Date().toISOString(),
        }),
        models.Reservation.updateOne({ id: reservation.id }, { $inc: { paid: amount } }),
      ]);
    }

    res.status(201).json({ data: await reservationById(reservation.id) });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const reservation = await models.Reservation.findOne({ id: req.params.id }).lean();
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
    if (await findOverlap({ bedId: next.bedId, arrival: next.arrival, departure: next.departure, excludeId: reservation.id })) {
      fail('This bed is already booked for the selected dates.', 'BED_OVERLAP', 409);
    }
    next.total = reservationTotal(next);

    const [guest, room, bed] = await Promise.all([
      models.Guest.findOne({ id: next.guestId }).lean(),
      models.Room.findOne({ id: next.roomId }).lean(),
      models.Bed.findOne({ id: next.bedId }).lean(),
    ]);

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
        guestName: guest?.name || reservation.guestName,
        roomNumber: room?.number || reservation.roomNumber,
        bedLabel: bed?.label || reservation.bedLabel,
      },
    );

    res.json({ data: await reservationById(reservation.id) });
  }),
);

router.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    const reservation = await models.Reservation.findOne({ id: req.params.id }).lean();
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

    const patch = { status, updatedAt: new Date().toISOString() };

    if (status === 'checkedIn') {
      const [occupied, bed] = await Promise.all([
        models.Reservation.findOne({
          bedId: reservation.bedId,
          id: { $ne: reservation.id },
          status: 'checkedIn',
        })
          .select({ id: 1 })
          .lean(),
        models.Bed.findOne({ id: reservation.bedId }).lean(),
      ]);
      if (occupied) fail('That bed is already occupied.', 'BED_OCCUPIED', 409);
      if (bed?.maintenance || bed?.outOfService) fail('That bed is out of service.', 'BED_UNAVAILABLE');
      if (bed) await models.Bed.updateOne({ id: bed.id }, { cleaning: false });
      patch.checkedInAt = new Date().toISOString();
    }
    if (status === 'checkedOut') {
      await models.Bed.updateOne({ id: reservation.bedId }, { cleaning: true });
      patch.checkedOutAt = new Date().toISOString();
    }

    await models.Reservation.updateOne({ id: reservation.id }, patch);
    res.json({ data: await reservationById(reservation.id) });
  }),
);

export default router;
export { enrichReservation };
