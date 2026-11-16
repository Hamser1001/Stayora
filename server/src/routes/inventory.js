import { Router } from 'express';
import { models } from '../db/models.js';
import { guestCounts, guestPage, hydrateGuests } from '../services/listing.js';
import { paged } from '../services/paging.js';
import { nextIdFor } from '../services/snapshot.js';
import { bedStatus, enrichRoom } from '../services/selectors.js';
import { addDays, todayISO } from '../lib/dates.js';
import { memo } from '../services/cache.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const BLOCKING_STATUSES = ['confirmed', 'checkedIn', 'pending'];

/**
 * Reservations that can still influence a bed's displayed status: today's
 * occupancy plus the next arrivals, not every future booking.
 */
function loadLiveReservations() {
  const today = todayISO();
  return memo(`rooms:live:${today}`, 4000, () =>
    models.Reservation.find({
      status: { $in: BLOCKING_STATUSES },
      departure: { $gt: today },
      arrival: { $lte: addDays(today, 45) },
    }).lean(),
  );
}

async function roomReadModel(roomIds) {
  const rooms = await models.Room.find(roomIds ? { id: { $in: roomIds } } : {}).lean();
  const [beds, reservations] = await Promise.all([
    models.Bed.find(roomIds ? { roomId: { $in: roomIds } } : {}).lean(),
    loadLiveReservations(),
  ]);
  const guestIds = [...new Set(reservations.map((reservation) => reservation.guestId))];
  const guests = await models.Guest.find({ id: { $in: guestIds } }, { id: 1, name: 1, _id: 0 }).lean();
  return { rooms, beds, reservations, guests, payments: [] };
}

/* ---------------------------------- Rooms --------------------------------- */

export const roomsRouter = Router();

roomsRouter.use(requirePermission('rooms'));

roomsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, type, floor, status } = req.query;
    const filter = {};
    if (type && type !== 'all') filter.type = String(type);
    if (floor !== undefined && floor !== 'all') filter.floor = Number(floor);
    const term = String(search || '').trim();
    if (term) {
      const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ number: rx }, { type: rx }];
    }

    const db = await roomReadModel();
    db.rooms = db.rooms.filter((room) => {
      if (filter.type && room.type !== filter.type) return false;
      if (Number.isFinite(filter.floor) && room.floor !== filter.floor) return false;
      if (term && !room.number.toLowerCase().includes(term.toLowerCase()) && !room.type.toLowerCase().includes(term.toLowerCase())) {
        return false;
      }
      return true;
    });

    let rooms = db.rooms.map((room) => enrichRoom(room, db));
    if (status && status !== 'all') rooms = rooms.filter((room) => room.beds.some((bed) => bed.status === status));

    rooms.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    res.json({ data: rooms });
  }),
);

roomsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = await roomReadModel([req.params.id]);
    const room = db.rooms[0];
    if (!room) fail('Room not found.', 'NOT_FOUND', 404);
    res.json({ data: enrichRoom(room, db) });
  }),
);

roomsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const number = String(payload.number || '').trim();
    if (!number) fail('Enter a room number.', 'VALIDATION_ERROR');
    const existing = await models.Room.findOne({ number: new RegExp(`^${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .select({ id: 1 })
      .lean();
    if (existing) fail('That room number already exists.', 'DUPLICATE_ROOM');

    const room = await models.Room.create({
      id: await nextIdFor('room', models.Room),
      number,
      type: payload.type || 'dorm',
      audience: payload.audience || 'mixed',
      floor: Number(payload.floor) || 0,
      bedCount: Number(payload.bedCount) || 1,
      pricePerBed: Number(payload.pricePerBed) || 1,
      amenities: payload.amenities || [],
      notes: payload.notes || '',
      createdAt: todayISO(),
    });

    const beds = Array.from({ length: room.bedCount }).map((_, index) => ({
      id: `bed_${room.number}_${index + 1}`,
      roomId: room.id,
      number: index + 1,
      label: `${room.number}-${String.fromCharCode(65 + index)}`,
      cleaning: false,
      maintenance: false,
      outOfService: false,
      note: '',
    }));
    if (beds.length) await models.Bed.insertMany(beds);

    const db = await roomReadModel([room.id]);
    res.status(201).json({ data: enrichRoom(db.rooms[0], db) });
  }),
);

roomsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const room = await models.Room.findOne({ id: req.params.id }).lean();
    if (!room) fail('Room not found.', 'NOT_FOUND', 404);

    const number = String(payload.number ?? room.number).trim();
    const duplicate = await models.Room.findOne({
      id: { $ne: room.id },
      number: new RegExp(`^${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })
      .select({ id: 1 })
      .lean();
    if (duplicate) fail('That room number already exists.', 'DUPLICATE_ROOM');

    const roomBeds = await models.Bed.find({ roomId: room.id }).sort({ number: 1 }).lean();
    const nextBedCount = Number(payload.bedCount ?? room.bedCount);

    if (nextBedCount < roomBeds.length) {
      const removable = roomBeds.slice(nextBedCount);
      const blocked = await models.Reservation.findOne({
        bedId: { $in: removable.map((bed) => bed.id) },
        status: { $in: BLOCKING_STATUSES },
      })
        .select({ id: 1 })
        .lean();
      if (blocked) fail('Beds with active reservations cannot be removed.', 'BED_HAS_ACTIVE_RESERVATION');
      await models.Bed.deleteMany({ id: { $in: removable.map((bed) => bed.id) } });
    }

    if (nextBedCount > roomBeds.length) {
      const additions = [];
      for (let index = roomBeds.length; index < nextBedCount; index += 1) {
        additions.push({
          id: `bed_${number}_${index + 1}`,
          roomId: room.id,
          number: index + 1,
          label: `${number}-${String.fromCharCode(65 + index)}`,
          cleaning: false,
          maintenance: false,
          outOfService: false,
          note: '',
        });
      }
      if (additions.length) await models.Bed.insertMany(additions);
    }

    await models.Room.updateOne(
      { id: room.id },
      {
        number,
        type: payload.type ?? room.type,
        audience: payload.audience ?? room.audience,
        floor: Number(payload.floor ?? room.floor),
        bedCount: nextBedCount,
        pricePerBed: Number(payload.pricePerBed ?? room.pricePerBed),
        amenities: payload.amenities ?? room.amenities,
        notes: payload.notes ?? room.notes,
      },
    );
    if (number !== room.number) {
      await models.Reservation.updateMany({ roomId: room.id }, { roomNumber: number });
    }

    const db = await roomReadModel([room.id]);
    res.json({ data: enrichRoom(db.rooms[0], db) });
  }),
);

roomsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const room = await models.Room.findOne({ id: req.params.id }).lean();
    if (!room) fail('Room not found.', 'NOT_FOUND', 404);

    const active = await models.Reservation.findOne({
      roomId: room.id,
      status: { $in: BLOCKING_STATUSES },
    })
      .select({ id: 1 })
      .lean();
    if (active) fail('This room has active reservations and cannot be deleted.', 'ROOM_HAS_ACTIVE_RESERVATIONS');

    const reservationIds = await models.Reservation.distinct('id', { roomId: room.id });
    await Promise.all([
      models.Payment.deleteMany({ reservationId: { $in: reservationIds } }),
      models.Reservation.deleteMany({ roomId: room.id }),
      models.Task.deleteMany({ roomId: room.id }),
      models.Bed.deleteMany({ roomId: room.id }),
      models.Room.deleteOne({ id: room.id }),
    ]);

    res.json({ data: { id: room.id } });
  }),
);

/* ----------------------------------- Beds ---------------------------------- */

export const bedsRouter = Router();

bedsRouter.use(requirePermission('rooms'));

bedsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const patch = req.body || {};
    const bed = await models.Bed.findOne({ id: req.params.id }).lean();
    if (!bed) fail('Bed not found.', 'NOT_FOUND', 404);

    const occupied = await models.Reservation.findOne({ bedId: bed.id, status: 'checkedIn' })
      .select({ id: 1 })
      .lean();
    if (occupied && patch.status && patch.status !== 'occupied') {
      fail('Check the guest out before changing this bed.', 'BED_OCCUPIED');
    }

    const next = { ...bed };
    if (patch.status === 'available') {
      next.cleaning = false;
      next.maintenance = false;
      next.outOfService = false;
    }
    if (patch.status === 'cleaning') {
      next.cleaning = true;
      next.maintenance = false;
      next.outOfService = false;
    }
    if (patch.status === 'maintenance') {
      next.cleaning = false;
      next.maintenance = true;
      next.outOfService = false;
    }
    if (patch.status === 'inactive') {
      next.cleaning = false;
      next.maintenance = false;
      next.outOfService = true;
    }
    if (typeof patch.note === 'string') next.note = patch.note;

    await models.Bed.updateOne(
      { id: bed.id },
      {
        cleaning: next.cleaning,
        maintenance: next.maintenance,
        outOfService: next.outOfService,
        note: next.note,
      },
    );

    const db = await roomReadModel([bed.roomId]);
    const updatedBed = db.beds.find((item) => item.id === bed.id);
    res.json({
      data: {
        ...updatedBed,
        status: bedStatus(updatedBed, db),
        room: enrichRoom(db.rooms[0], db),
      },
    });
  }),
);

/* ---------------------------------- Guests --------------------------------- */

export const guestsRouter = Router();

guestsRouter.use(requirePermission('guests'));

guestsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows, total, paging } = await guestPage(req.query);
    const counts = await guestCounts();
    res.json(paged(rows, { ...paging, total, counts }));
  }),
);

/** Lightweight option list for pickers — projected fields only, capped. */
guestsRouter.get(
  '/options',
  asyncHandler(async (req, res) => {
    const limit = Math.min(2000, Math.max(1, Number.parseInt(req.query.limit, 10) || 2000));
    const term = String(req.query.search || '').trim();
    const filter = term
      ? { name: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      : {};
    const guests = await models.Guest.find(filter, { id: 1, name: 1, email: 1, phone: 1, _id: 0 })
      .sort({ name: 1 })
      .limit(limit)
      .lean();
    res.json({ data: guests });
  }),
);

guestsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const guest = await models.Guest.findOne({ id: req.params.id }).lean();
    if (!guest) fail('Guest not found.', 'NOT_FOUND', 404);
    const [enriched] = await hydrateGuests([guest]);
    res.json({ data: enriched });
  }),
);

guestsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const name = String(payload.name || '').trim();
    if (!name) fail('Guest name is required.', 'VALIDATION_ERROR');

    const guest = await models.Guest.create({
      id: await nextIdFor('guest', models.Guest),
      name,
      email: payload.email || '',
      phone: payload.phone || '',
      nationality: payload.nationality || '',
      idType: payload.idType || 'passport',
      idNumber: payload.idNumber || '',
      notes: payload.notes || '',
      createdAt: todayISO(),
    });

    const [enriched] = await hydrateGuests([guest.toObject()]);
    res.status(201).json({ data: enriched });
  }),
);

guestsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const guest = await models.Guest.findOne({ id: req.params.id }).lean();
    if (!guest) fail('Guest not found.', 'NOT_FOUND', 404);

    const allowed = ['name', 'email', 'phone', 'nationality', 'idType', 'idNumber', 'notes'];
    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)),
    );
    await models.Guest.updateOne({ id: guest.id }, patch);

    if (patch.name && patch.name !== guest.name) {
      await Promise.all([
        models.Reservation.updateMany({ guestId: guest.id }, { guestName: patch.name }),
        models.Payment.updateMany({ guestId: guest.id }, { guestName: patch.name }),
      ]);
    }

    const updated = await models.Guest.findOne({ id: guest.id }).lean();
    const [enriched] = await hydrateGuests([updated]);
    res.json({ data: enriched });
  }),
);
