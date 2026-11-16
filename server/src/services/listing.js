import { models } from '../db/models.js';
import { addDays, nightsBetween, todayISO } from '../lib/dates.js';
import { paymentStatusOf } from './selectors.js';
import { parseListQuery, searchRegex } from './paging.js';
import { memo } from './cache.js';

const CLOSED = ['cancelled', 'noShow'];
const ACTIVE = ['confirmed', 'checkedIn', 'pending'];

const round = (value) => Math.round(value * 100) / 100;

/* ------------------------------ Reservations ------------------------------ */

const RESERVATION_SORTS = [
  'arrival',
  'departure',
  'reference',
  'guestName',
  'total',
  'status',
  'createdAt',
];

export function reservationFilter(query = {}) {
  const filter = {};
  const { status, source, from, to, roomId, search } = query;

  if (status && status !== 'all') filter.status = String(status);
  if (source && source !== 'all') filter.source = String(source);
  if (roomId) filter.roomId = String(roomId);
  if (from) filter.departure = { $gt: String(from) };
  if (to) filter.arrival = { $lt: addDays(String(to), 1) };

  const rx = searchRegex(search);
  if (rx) {
    filter.$or = [{ reference: rx }, { guestName: rx }, { roomNumber: rx }];
  }
  return filter;
}

/** Hydrate the requested page of reservations with their guest/room/bed objects. */
export async function enrichReservationRows(rows) {
  if (rows.length === 0) return [];

  const guestIds = [...new Set(rows.map((row) => row.guestId))];
  const roomIds = [...new Set(rows.map((row) => row.roomId))];
  const bedIds = [...new Set(rows.map((row) => row.bedId))];

  // Rooms and beds only change on writes, so they are cached across requests.
  const [guests, rooms, beds] = await Promise.all([
    models.Guest.find({ id: { $in: guestIds } }).lean(),
    memo('ref:rooms', 30000, () => models.Room.find().lean()),
    memo('ref:beds', 30000, () => models.Bed.find().lean()),
  ]);
  const guestMap = new Map(guests.map((guest) => [guest.id, guest]));
  const roomMap = new Map(rooms.filter((room) => roomIds.includes(room.id)).map((room) => [room.id, room]));
  const bedMap = new Map(beds.filter((bed) => bedIds.includes(bed.id)).map((bed) => [bed.id, bed]));

  return rows.map((reservation) => {
    const guest = guestMap.get(reservation.guestId) || null;
    const room = roomMap.get(reservation.roomId) || null;
    const bed = bedMap.get(reservation.bedId) || null;
    const total =
      reservation.total ?? nightsBetween(reservation.arrival, reservation.departure) * reservation.rate;
    const paid = round(reservation.paid || 0);
    return {
      ...reservation,
      total,
      paid,
      balance: Math.max(0, round(total - paid)),
      paymentStatus: paymentStatusOf(total, paid),
      nights: nightsBetween(reservation.arrival, reservation.departure),
      guest,
      guestName: guest?.name || reservation.guestName || '—',
      room,
      roomNumber: room?.number || reservation.roomNumber || '—',
      roomType: room?.type,
      bed,
      bedLabel: bed?.label || reservation.bedLabel || '—',
    };
  });
}

export function reservationCounts() {
  // Badge counters tolerate a few seconds of staleness; recomputing four scans
  // on every list request (one per keystroke) is not worth the freshness.
  return memo('counts:reservations', 5000, computeReservationCounts);
}

async function computeReservationCounts() {
  const today = todayISO();
  const [row] = await models.Reservation.aggregate([
    {
      $facet: {
        arrivals: [{ $match: { arrival: today, status: { $in: ['confirmed', 'pending'] } } }, { $count: 'n' }],
        departures: [{ $match: { departure: today, status: 'checkedIn' } }, { $count: 'n' }],
        inHouse: [{ $match: { status: 'checkedIn' } }, { $count: 'n' }],
        pending: [{ $match: { status: 'pending' } }, { $count: 'n' }],
      },
    },
  ]);
  return {
    arrivals: row?.arrivals?.[0]?.n || 0,
    departures: row?.departures?.[0]?.n || 0,
    inHouse: row?.inHouse?.[0]?.n || 0,
    pending: row?.pending?.[0]?.n || 0,
  };
}

export async function reservationPage(query = {}) {
  const paging = parseListQuery(query, {
    sortable: RESERVATION_SORTS,
    defaultSort: { arrival: -1, id: -1 },
    defaultPageSize: 12,
  });
  const filter = reservationFilter(query);

  const [rows, total, counts] = await Promise.all([
    models.Reservation.find(filter).sort(paging.sortSpec).skip(paging.skip).limit(paging.pageSize).lean(),
    models.Reservation.countDocuments(filter),
    reservationCounts(),
  ]);

  return { rows: await enrichReservationRows(rows), total, counts, paging };
}

/* --------------------------------- Guests --------------------------------- */

const GUEST_SORTS = { name: 'name', stayCount: 'stayCount', totalSpent: 'totalSpent', outstanding: 'outstanding' };

const GUEST_GROUP = {
  $group: {
    _id: '$guestId',
    stayCount: { $sum: 1 },
    totalSpent: { $sum: { $ifNull: ['$paid', 0] } },
    outstanding: {
      $sum: {
        $cond: [
          { $in: ['$status', ACTIVE] },
          { $max: [0, { $subtract: ['$total', { $ifNull: ['$paid', 0] }] }] },
          0,
        ],
      },
    },
    currentCount: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, 1, 0] } },
    upcomingCount: {
      $sum: {
        $cond: [{ $and: [{ $eq: ['$status', 'confirmed'] }, { $gte: ['$arrival', todayISO()] }] }, 1, 0],
      },
    },
  },
};

/**
 * Guest rollups: one grouping pass over reservations, cached for a few seconds
 * and merged with every guest document (so guests without stays still list).
 */
function guestRollups() {
  return memo('guests:rollups', 15000, async () => {
    const [guests, aggregates] = await Promise.all([
      memo('ref:guests', 15000, () => models.Guest.find().lean()),
      models.Reservation.aggregate([
        { $match: { status: { $nin: CLOSED } } },
        { $group: { ...GUEST_GROUP.$group } },
      ]),
    ]);
    const byGuest = new Map(aggregates.map((row) => [row._id, row]));
    return guests.map((guest) => {
      const row = byGuest.get(guest.id);
      return {
        guest,
        stayCount: row?.stayCount || 0,
        totalSpent: round(row?.totalSpent || 0),
        outstanding: round(row?.outstanding || 0),
        currentCount: row?.currentCount || 0,
        upcomingCount: row?.upcomingCount || 0,
      };
    });
  });
}

export async function guestCounts() {
  const rows = await guestRollups();
  return {
    all: rows.length,
    inHouse: rows.filter((row) => row.currentCount > 0).length,
    upcoming: rows.filter((row) => row.upcomingCount > 0).length,
    balance: rows.filter((row) => row.outstanding > 0.009).length,
  };
}

export async function guestPage(query = {}) {
  const paging = parseListQuery(query, {
    sortable: Object.keys(GUEST_SORTS),
    defaultSort: { name: 1, _id: 1 },
    defaultPageSize: 12,
  });

  const filter = String(query.filter || 'all');
  const term = String(query.search || '').trim().toLowerCase();

  const rows = (await guestRollups()).filter((row) => {
    if (filter === 'inHouse' && row.currentCount === 0) return false;
    if (filter === 'upcoming' && row.upcomingCount === 0) return false;
    if (filter === 'balance' && row.outstanding <= 0.009) return false;
    if (!term) return true;
    const { name = '', email = '', phone = '' } = row.guest;
    return (
      name.toLowerCase().includes(term) ||
      email.toLowerCase().includes(term) ||
      phone.includes(term)
    );
  });

  const direction = paging.direction === 1 ? 1 : -1;
  const sorters = {
    stayCount: (a, b) => a.stayCount - b.stayCount,
    totalSpent: (a, b) => a.totalSpent - b.totalSpent,
    outstanding: (a, b) => a.outstanding - b.outstanding,
    name: (a, b) => String(a.guest.name).localeCompare(String(b.guest.name)),
  };
  const compare = sorters[paging.sortKey || 'name'] || sorters.name;
  rows.sort((a, b) => compare(a, b) * direction || String(a.guest.id).localeCompare(String(b.guest.id)));

  const pageGuests = rows.slice(paging.skip, paging.skip + paging.pageSize).map((row) => row.guest);
  return { rows: await hydrateGuests(pageGuests, { includeStays: false }), total: rows.length, paging };
}

/**
 * Rebuild the guest read model for one page: one indexed query for their stays,
 * then the same enrichment shape the client already consumes.
 */
export async function hydrateGuests(guests, { includeStays = true } = {}) {
  if (guests.length === 0) return [];
  const guestIds = guests.map((guest) => guest.id);

  const [reservations, rooms, beds] = await Promise.all([
    models.Reservation.find({ guestId: { $in: guestIds } }).sort({ arrival: -1 }).lean(),
    memo('ref:rooms', 30000, () => models.Room.find().lean()),
    memo('ref:beds', 30000, () => models.Bed.find().lean()),
  ]);

  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const bedMap = new Map(beds.map((bed) => [bed.id, bed]));

  const byGuest = new Map();
  reservations.forEach((reservation) => {
    const list = byGuest.get(reservation.guestId) || [];
    list.push(reservation);
    byGuest.set(reservation.guestId, list);
  });

  return guests.map((guest) => {
    const stays = (byGuest.get(guest.id) || []).map((reservation) => {
      const room = roomMap.get(reservation.roomId) || null;
      const bed = bedMap.get(reservation.bedId) || null;
      const total =
        reservation.total ?? nightsBetween(reservation.arrival, reservation.departure) * reservation.rate;
      // `paid` is denormalised on the reservation and kept in sync with the ledger.
      const paid = round(reservation.paid || 0);
      return {
        ...reservation,
        total,
        paid,
        balance: Math.max(0, round(total - paid)),
        paymentStatus: paymentStatusOf(total, paid),
        nights: nightsBetween(reservation.arrival, reservation.departure),
        guest,
        guestName: guest.name,
        room,
        roomNumber: room?.number || '—',
        roomType: room?.type,
        bed,
        bedLabel: bed?.label || '—',
      };
    });
    stays.sort((a, b) => String(b.arrival).localeCompare(String(a.arrival)));

    const valid = stays.filter((stay) => !CLOSED.includes(stay.status));
    const completed = valid.filter((stay) => stay.status === 'checkedOut');
    const paidTotal = stays.reduce((sum, stay) => sum + stay.paid, 0);
    const outstanding = valid
      .filter((stay) => ACTIVE.includes(stay.status))
      .reduce((sum, stay) => sum + stay.balance, 0);
    const current = valid.find((stay) => stay.status === 'checkedIn') || null;
    const upcoming =
      valid
        .filter((stay) => stay.status === 'confirmed' && stay.arrival >= todayISO())
        .sort((a, b) => a.arrival.localeCompare(b.arrival))[0] || null;
    const totalNights = completed.reduce((sum, stay) => sum + stay.nights, 0);

    return {
      ...guest,
      // List responses omit the stay history; the profile endpoint includes it.
      ...(includeStays ? { reservations: stays } : {}),
      stayCount: valid.length,
      completedStays: completed.length,
      totalSpent: round(paidTotal),
      outstanding: round(outstanding),
      lastStay: completed[0] || null,
      currentStay: current,
      upcomingStay: upcoming,
      avgStay: completed.length ? totalNights / completed.length : 0,
      returning: valid.length > 1,
    };
  });
}

/* -------------------------------- Payments -------------------------------- */

const PAYMENT_SORTS = { date: 'date', amount: 'amount', guestName: 'guestName', method: 'method' };

export async function paymentPage(query = {}) {
  const paging = parseListQuery(query, {
    sortable: Object.keys(PAYMENT_SORTS),
    defaultSort: { date: -1, createdAt: -1 },
    defaultPageSize: 25,
  });

  const filter = {};
  if (query.method && query.method !== 'all') filter.method = String(query.method);
  if (query.from) filter.date = { ...(filter.date || {}), $gte: String(query.from) };
  if (query.to) filter.date = { ...(filter.date || {}), $lte: String(query.to) };
  const rx = searchRegex(query.search);
  if (rx) filter.$or = [{ guestName: rx }, { reference: rx }, { reservationReference: rx }];

  const sortKey = paging.sortKey ? PAYMENT_SORTS[paging.sortKey] : null;
  const sortSpec = sortKey
    ? { [sortKey]: paging.direction, date: -1 }
    : paging.sortSpec;

  const [rows, total] = await Promise.all([
    models.Payment.find(filter).sort(sortSpec).skip(paging.skip).limit(paging.pageSize).lean(),
    models.Payment.countDocuments(filter),
  ]);

  return { rows, total, paging };
}

export async function paymentCounts(from, to) {
  const [row] = await models.Payment.aggregate([
    { $match: { date: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        collected: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, 0, '$amount'] } },
        refunds: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, '$amount', 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  return row || { collected: 0, refunds: 0, count: 0 };
}
