import { Router } from 'express';
import { models } from '../db/models.js';
import { loadSnapshot, nextId } from '../services/snapshot.js';
import { bedStatus, enrichGuest, enrichRoom } from '../services/selectors.js';
import { todayISO } from '../lib/dates.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

const BLOCKING_STATUSES = ['confirmed', 'checkedIn', 'pending'];

/* ---------------------------------- Rooms --------------------------------- */

export const roomsRouter = Router();

roomsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const { search, type, floor, status } = req.query;
    let rooms = db.rooms.map((room) => enrichRoom(room, db));

    if (search) {
      const term = String(search).toLowerCase();
      rooms = rooms.filter(
        (room) => room.number.toLowerCase().includes(term) || room.type.toLowerCase().includes(term),
      );
    }
    if (type && type !== 'all') rooms = rooms.filter((room) => room.type === type);
    if (floor !== undefined && floor !== 'all') {
      rooms = rooms.filter((room) => room.floor === Number(floor));
    }
    if (status && status !== 'all') {
      rooms = rooms.filter((room) => room.beds.some((bed) => bed.status === status));
    }

    rooms.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    res.json({ data: rooms });
  }),
);

roomsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const room = db.rooms.find((item) => item.id === req.params.id);
    if (!room) fail('Room not found.', 'NOT_FOUND', 404);
    res.json({ data: enrichRoom(room, db) });
  }),
);

roomsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const snapshot = await loadSnapshot();
    const number = String(payload.number || '').trim();
    if (!number) fail('Enter a room number.', 'VALIDATION_ERROR');
    if (snapshot.rooms.some((room) => room.number.toLowerCase() === number.toLowerCase())) {
      fail('That room number already exists.', 'DUPLICATE_ROOM');
    }

    const room = await models.Room.create({
      id: nextId('rom', snapshot.rooms),
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

    const db = await loadSnapshot();
    res.status(201).json({ data: enrichRoom(db.rooms.find((item) => item.id === room.id), db) });
  }),
);

roomsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const snapshot = await loadSnapshot();
    const room = snapshot.rooms.find((item) => item.id === req.params.id);
    if (!room) fail('Room not found.', 'NOT_FOUND', 404);

    const number = String(payload.number ?? room.number).trim();
    if (
      snapshot.rooms.some(
        (item) => item.id !== room.id && item.number.toLowerCase() === number.toLowerCase(),
      )
    ) {
      fail('That room number already exists.', 'DUPLICATE_ROOM');
    }

    const roomBeds = snapshot.beds.filter((bed) => bed.roomId === room.id);
    const nextBedCount = Number(payload.bedCount ?? room.bedCount);

    if (nextBedCount < roomBeds.length) {
      const removable = roomBeds.slice(nextBedCount);
      const blocked = removable.find((bed) =>
        snapshot.reservations.some(
          (reservation) =>
            reservation.bedId === bed.id && BLOCKING_STATUSES.includes(reservation.status),
        ),
      );
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

    const db = await loadSnapshot();
    res.json({ data: enrichRoom(db.rooms.find((item) => item.id === room.id), db) });
  }),
);

roomsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const snapshot = await loadSnapshot();
    const room = snapshot.rooms.find((item) => item.id === req.params.id);
    if (!room) fail('Room not found.', 'NOT_FOUND', 404);

    const bedIds = snapshot.beds.filter((bed) => bed.roomId === room.id).map((bed) => bed.id);
    const active = snapshot.reservations.some(
      (reservation) =>
        bedIds.includes(reservation.bedId) && BLOCKING_STATUSES.includes(reservation.status),
    );
    if (active) fail('This room has active reservations and cannot be deleted.', 'ROOM_HAS_ACTIVE_RESERVATIONS');

    const reservationIds = snapshot.reservations
      .filter((reservation) => reservation.roomId === room.id)
      .map((reservation) => reservation.id);

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

bedsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const patch = req.body || {};
    const db = await loadSnapshot();
    const bed = db.beds.find((item) => item.id === req.params.id);
    if (!bed) fail('Bed not found.', 'NOT_FOUND', 404);

    const occupied = db.reservations.some(
      (reservation) => reservation.bedId === bed.id && reservation.status === 'checkedIn',
    );
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

    const fresh = await loadSnapshot();
    const updated = fresh.beds.find((item) => item.id === bed.id);
    const room = fresh.rooms.find((item) => item.id === bed.roomId);
    res.json({
      data: { ...updated, status: bedStatus(updated, fresh), room: enrichRoom(room, fresh) },
    });
  }),
);

/* ---------------------------------- Guests --------------------------------- */

export const guestsRouter = Router();

guestsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const { search, filter } = req.query;
    let guests = db.guests.map((guest) => enrichGuest(guest, db));

    if (search) {
      const term = String(search).toLowerCase();
      guests = guests.filter(
        (guest) =>
          guest.name.toLowerCase().includes(term) ||
          guest.email.toLowerCase().includes(term) ||
          guest.phone.includes(term),
      );
    }
    if (filter === 'inHouse') guests = guests.filter((guest) => guest.currentStay);
    if (filter === 'upcoming') guests = guests.filter((guest) => guest.upcomingStay);
    if (filter === 'balance') guests = guests.filter((guest) => guest.outstanding > 0);

    guests.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ data: guests });
  }),
);

guestsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const guest = db.guests.find((item) => item.id === req.params.id);
    if (!guest) fail('Guest not found.', 'NOT_FOUND', 404);
    res.json({ data: enrichGuest(guest, db) });
  }),
);

guestsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const name = String(payload.name || '').trim();
    if (!name) fail('Guest name is required.', 'VALIDATION_ERROR');

    const db = await loadSnapshot();
    const guest = await models.Guest.create({
      id: nextId('gst', db.guests),
      name,
      email: payload.email || '',
      phone: payload.phone || '',
      nationality: payload.nationality || '',
      idType: payload.idType || 'passport',
      idNumber: payload.idNumber || '',
      notes: payload.notes || '',
      createdAt: todayISO(),
    });

    const fresh = await loadSnapshot();
    res.status(201).json({ data: enrichGuest(fresh.guests.find((item) => item.id === guest.id), fresh) });
  }),
);

guestsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const guest = db.guests.find((item) => item.id === req.params.id);
    if (!guest) fail('Guest not found.', 'NOT_FOUND', 404);

    const allowed = ['name', 'email', 'phone', 'nationality', 'idType', 'idNumber', 'notes'];
    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)),
    );
    await models.Guest.updateOne({ id: guest.id }, patch);

    const fresh = await loadSnapshot();
    res.json({ data: enrichGuest(fresh.guests.find((item) => item.id === guest.id), fresh) });
  }),
);
