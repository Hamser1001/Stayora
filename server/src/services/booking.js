import { models } from '../db/models.js';
import { cmsModels } from '../db/cmsModels.js';
import { addDays, nightsBetween, todayISO } from '../lib/dates.js';
import { ApiError } from '../middleware/error.js';
import { nextIdFor, reservationReference } from './snapshot.js';

/**
 * Public booking
 * --------------
 * Availability, overlap and totals are the same rules the dashboard uses. The
 * website is a second entry point into the reservation engine, not a second
 * implementation of it: it books a real bed in a real room, with the same
 * overlap guard, the same per-bed rate and the same ledger-backed total.
 *
 * A public booking always lands as `pending` and unpaid. Stayora has no online
 * payment provider, so nothing is charged here; staff confirm the booking and
 * take payment in the dashboard.
 */
export const CANCELLED = ['cancelled', 'noShow'];
export const MAX_NIGHTS = 30;
export const MAX_ADVANCE_DAYS = 365;

export function reservationTotal({ rate, arrival, departure, discount = 0 }) {
  return Math.max(0, nightsBetween(arrival, departure) * rate - discount);
}

/** Bed ids already held by a live reservation in the requested window. */
export async function occupiedBedIds(arrival, departure) {
  return models.Reservation.distinct('bedId', {
    status: { $nin: CANCELLED },
    arrival: { $lt: departure },
    departure: { $gt: arrival },
  });
}

export async function findOverlap({ bedId, arrival, departure, excludeId }) {
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

const ROOM_TYPES = {
  dorm: 'Shared dorm',
  private: 'Private room',
  twin: 'Twin room',
  family: 'Family room',
  suite: 'Suite',
};

function assertStay(arrival, departure) {
  if (!arrival || !departure) {
    throw new ApiError('Choose an arrival and a departure date.', { code: 'INVALID_DATES', status: 400 });
  }
  const nights = nightsBetween(arrival, departure);
  if (!nights) {
    throw new ApiError('Departure must be after arrival.', { code: 'INVALID_DATES', status: 400 });
  }
  if (arrival < todayISO()) {
    throw new ApiError('Arrival cannot be in the past.', { code: 'INVALID_DATES', status: 400 });
  }
  if (nights > MAX_NIGHTS) {
    throw new ApiError(`Stays are limited to ${MAX_NIGHTS} nights online.`, {
      code: 'STAY_TOO_LONG',
      status: 400,
    });
  }
  if (arrival > addDays(todayISO(), MAX_ADVANCE_DAYS)) {
    throw new ApiError('That arrival date is too far ahead.', { code: 'DATE_TOO_FAR', status: 400 });
  }
  return nights;
}

export async function siteForSlug(slug) {
  const site = await cmsModels.CmsSite.findOne({ workspaceKey: 'workspace', slug: String(slug || '') }).lean();
  if (!site) throw new ApiError('Not found.', { code: 'NOT_FOUND', status: 404 });
  return site;
}

/**
 * Room-level availability for the website: how many beds are free per room,
 * what it costs and whether the party fits. Bed-level detail stays internal.
 */
export async function availabilityForSite(slug, { arrival, departure, guests = 1 } = {}) {
  await siteForSlug(slug);
  const nights = assertStay(arrival, departure);
  const wanted = Math.max(1, Math.min(20, Number(guests) || 1));

  const [occupied, rooms, beds] = await Promise.all([
    occupiedBedIds(arrival, departure),
    models.Room.find().lean(),
    models.Bed.find({ maintenance: false, outOfService: false }).lean(),
  ]);

  const taken = new Set(occupied);
  const freeByRoom = new Map();
  for (const bed of beds) {
    if (taken.has(bed.id)) continue;
    const list = freeByRoom.get(bed.roomId) || [];
    list.push(bed.id);
    freeByRoom.set(bed.roomId, list);
  }

  const options = rooms
    .map((room) => {
      const free = freeByRoom.get(room.id) || [];
      const capacity = Math.max(1, room.bedCount || free.length || 1);
      const fits = free.length >= wanted;
      return {
        roomId: room.id,
        number: room.number,
        type: room.type,
        typeLabel: ROOM_TYPES[room.type] || room.type,
        audience: room.audience || 'mixed',
        floor: room.floor || 0,
        amenities: room.amenities || [],
        pricePerBed: room.pricePerBed,
        capacity,
        bedsAvailable: free.length,
        available: fits && free.length > 0,
        nights,
        total: Math.round(room.pricePerBed * nights * wanted * 100) / 100,
        totalPerNight: Math.round(room.pricePerBed * wanted * 100) / 100,
      };
    })
    .filter((room) => room.bedsAvailable > 0)
    .sort((a, b) => Number(b.available) - Number(a.available) || a.pricePerBed - b.pricePerBed);

  return { arrival, departure, nights, guests: wanted, options };
}

function guestIdentity(input) {
  const name = String(input?.name || '').trim();
  const email = String(input?.email || '').trim().toLowerCase();
  const phone = String(input?.phone || '').trim();
  const country = String(input?.country || '').trim();
  const notes = String(input?.notes || '').trim();

  if (name.length < 2 || name.length > 80) {
    throw new ApiError('Please enter your full name.', { code: 'INVALID_GUEST', status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) {
    throw new ApiError('Please enter a valid email address.', { code: 'INVALID_EMAIL', status: 400 });
  }
  if (phone.replace(/[^0-9]/g, '').length < 6 || phone.length > 30) {
    throw new ApiError('Please enter a valid phone number.', { code: 'INVALID_PHONE', status: 400 });
  }
  if (country.length > 60) {
    throw new ApiError('Country is too long.', { code: 'INVALID_GUEST', status: 400 });
  }
  if (notes.length > 500) {
    throw new ApiError('Please keep your message under 500 characters.', { code: 'INVALID_GUEST', status: 400 });
  }
  return { name, email, phone, country, notes };
}

/** Reuses the guest record, never overwriting details staff may have edited. */
async function upsertGuest(identity) {
  const existing = await models.Guest.findOne({ email: identity.email }).lean();
  if (existing) {
    const patch = {};
    if (!existing.phone && identity.phone) patch.phone = identity.phone;
    if (!existing.nationality && identity.country) patch.nationality = identity.country;
    if (Object.keys(patch).length) await models.Guest.updateOne({ id: existing.id }, { $set: patch });
    return { ...existing, ...patch };
  }

  const guest = await models.Guest.create({
    id: await nextIdFor('guest', models.Guest),
    name: identity.name,
    email: identity.email,
    phone: identity.phone,
    nationality: identity.country,
    notes: '',
    createdAt: new Date().toISOString(),
  });
  return guest.toObject();
}

/** Any bed of the room that survives the maintenance and overlap checks. */
async function pickBed(roomId, arrival, departure) {
  const beds = await models.Bed.find({ roomId, maintenance: false, outOfService: false })
    .sort({ number: 1 })
    .lean();
  for (const bed of beds) {
    if (!(await findOverlap({ bedId: bed.id, arrival, departure }))) return bed;
  }
  return null;
}

function publicBookingView(reservation, room) {
  return {
    reference: reservation.reference,
    status: reservation.status,
    arrival: reservation.arrival,
    departure: reservation.departure,
    nights: nightsBetween(reservation.arrival, reservation.departure),
    guests: reservation.guests,
    roomType: room.type,
    roomTypeLabel: ROOM_TYPES[room.type] || room.type,
    roomNumber: room.number,
    total: reservation.total,
    currency: 'EUR',
    createdAt: reservation.createdAt,
  };
}

export async function createPublicBooking(slug, payload) {
  await siteForSlug(slug);

  // Bots fill hidden fields; humans never see them.
  if (String(payload?.company || '').trim()) {
    throw new ApiError('Your request could not be processed.', { code: 'REJECTED', status: 400 });
  }

  const nights = assertStay(payload?.arrival, payload?.departure);
  const identity = guestIdentity(payload?.guest || {});
  const guests = Math.max(1, Math.min(20, Number(payload?.guests) || 1));

  const room = await models.Room.findOne({ id: String(payload?.roomId || '') }).lean();
  if (!room) throw new ApiError('That room type is no longer available.', { code: 'ROOM_NOT_FOUND', status: 404 });

  // A repeated submit (double click, retry) must not book twice.
  const recent = await models.Reservation.findOne({
    roomId: room.id,
    arrival: payload.arrival,
    departure: payload.departure,
    source: 'website',
    status: 'pending',
    createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
    guestName: identity.name,
  }).lean();
  if (recent) return { ...publicBookingView(recent, room), duplicate: true };

  if (guests > Math.max(1, room.bedCount || 1)) {
    throw new ApiError(`This room takes up to ${room.bedCount || 1} guests.`, {
      code: 'TOO_MANY_GUESTS',
      status: 400,
    });
  }

  const bed = await pickBed(room.id, payload.arrival, payload.departure);
  if (!bed) {
    throw new ApiError('That room type is fully booked for these dates. Try another room or range.', {
      code: 'NO_BED_AVAILABLE',
      status: 409,
    });
  }

  const guest = await upsertGuest(identity);
  const rate = room.pricePerBed;
  const total = reservationTotal({ rate, arrival: payload.arrival, departure: payload.departure });
  const publicTotal = Math.round(total * guests * 100) / 100;

  const id = await nextIdFor('reservation', models.Reservation);
  const sequence = Number(String(id).split('_')[1]) || 1;
  const reservation = await models.Reservation.create({
    id,
    reference: reservationReference(sequence),
    guestId: guest.id,
    roomId: room.id,
    bedId: bed.id,
    arrival: payload.arrival,
    departure: payload.departure,
    guests,
    rate,
    discount: 0,
    total: publicTotal,
    paid: 0,
    source: 'website',
    status: 'pending',
    notes: identity.notes ? `Website: ${identity.notes}` : '',
    createdAt: new Date().toISOString(),
    createdBy: 'Website',
    guestName: guest.name,
    roomNumber: room.number,
    bedLabel: bed.label,
  });

  return publicBookingView(reservation.toObject(), room);
}
