import { addDays, diffDays, eachDay, nightsBetween, todayISO } from '../lib/dates.js';

const CANCELLED_LIKE = ['cancelled', 'noShow'];
const MONEY_EPSILON = 0.009;

export function reservationPaidTotal(reservationId, payments) {
  return payments
    .filter((p) => p.reservationId === reservationId)
    .reduce((sum, p) => sum + (p.type === 'refund' ? -p.amount : p.amount), 0);
}

export function paymentStatusOf(total, paid) {
  if (paid <= MONEY_EPSILON) return 'unpaid';
  if (paid >= total - MONEY_EPSILON) return 'paid';
  return 'partial';
}

/**
 * Group reservations by bed once per request instead of filtering the whole
 * list for every bed (beds x reservations became quadratic on large datasets).
 */
export function bedIndex(db) {
  if (db.__bedIndex) return db.__bedIndex;
  const byBed = new Map();
  for (const reservation of db.reservations || []) {
    const list = byBed.get(reservation.bedId);
    if (list) list.push(reservation);
    else byBed.set(reservation.bedId, [reservation]);
  }
  Object.defineProperty(db, '__bedIndex', { value: byBed, enumerable: false });
  return byBed;
}

export function bedStatus(bed, db) {
  if (bed.outOfService) return 'inactive';
  if (bed.maintenance) return 'maintenance';
  const stays = bedIndex(db).get(bed.id) || [];
  const today = todayISO();
  let reserved = false;
  for (const stay of stays) {
    if (stay.status === 'checkedIn') return 'occupied';
    if (stay.status === 'confirmed' && stay.arrival <= today && stay.departure > today) reserved = true;
  }
  if (reserved) return 'reserved';
  if (bed.cleaning) return 'cleaning';
  return 'available';
}

export function currentReservationForBed(bedId, db) {
  const today = todayISO();
  return (
    (bedIndex(db).get(bedId) || []).find(
      (r) => ['checkedIn', 'confirmed'].includes(r.status) && r.arrival <= today && r.departure > today,
    ) || null
  );
}

export function enrichReservation(reservation, db) {
  if (!reservation) return null;
  const guest = db.guests.find((g) => g.id === reservation.guestId);
  const room = db.rooms.find((r) => r.id === reservation.roomId);
  const bed = db.beds.find((b) => b.id === reservation.bedId);
  const paid = reservation.paid ?? reservationPaidTotal(reservation.id, db.payments || []);
  const total = reservation.total ?? nightsBetween(reservation.arrival, reservation.departure) * reservation.rate;
  return {
    ...reservation,
    total,
    paid,
    balance: Math.max(0, Math.round((total - paid) * 100) / 100),
    paymentStatus: paymentStatusOf(total, paid),
    nights: nightsBetween(reservation.arrival, reservation.departure),
    guest: guest || null,
    guestName: guest?.name || '—',
    room: room || null,
    roomNumber: room?.number || '—',
    roomType: room?.type,
    bed: bed || null,
    bedLabel: bed?.label || '—',
  };
}

export function enrichRoom(room, db) {
  const beds = db.beds
    .filter((b) => b.roomId === room.id)
    .map((bed) => {
      const status = bedStatus(bed, db);
      const current = currentReservationForBed(bed.id, db);
      const next = (bedIndex(db).get(bed.id) || [])
        .filter((r) => ['confirmed', 'pending'].includes(r.status) && r.arrival > todayISO())
        .sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
      return {
        ...bed,
        status,
        guestId: current?.guestId || null,
        guestName: current
          ? db.guests.find((g) => g.id === current.guestId)?.name || null
          : null,
        reservationId: current?.id || null,
        stayStart: current?.arrival || null,
        stayEnd: current?.departure || null,
        nextArrival: next?.arrival || null,
      };
    });
  const counts = beds.reduce(
    (acc, bed) => ({ ...acc, [bed.status]: (acc[bed.status] || 0) + 1 }),
    {},
  );
  return {
    ...room,
    beds,
    counts,
    totalBeds: beds.length,
    availableBeds: counts.available || 0,
    occupiedBeds: counts.occupied || 0,
    reservedBeds: counts.reserved || 0,
    cleaningBeds: counts.cleaning || 0,
    maintenanceBeds: (counts.maintenance || 0) + (counts.inactive || 0),
    needsAttention: (counts.cleaning || 0) + (counts.maintenance || 0) + (counts.inactive || 0),
  };
}

export function enrichGuest(guest, db) {
  const stays = db.reservations
    .filter((r) => r.guestId === guest.id)
    .map((r) => enrichReservation(r, db))
    .sort((a, b) => b.arrival.localeCompare(a.arrival));
  const valid = stays.filter((r) => !CANCELLED_LIKE.includes(r.status));
  const completed = valid.filter((r) => r.status === 'checkedOut');
  const paidTotal = stays.reduce((sum, r) => sum + r.paid, 0);
  const outstanding = valid
    .filter((r) => ['confirmed', 'checkedIn', 'pending'].includes(r.status))
    .reduce((sum, r) => sum + r.balance, 0);
  const current = valid.find((r) => r.status === 'checkedIn') || null;
  const upcoming = valid
    .filter((r) => r.status === 'confirmed' && r.arrival >= todayISO())
    .sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
  const totalNights = completed.reduce((sum, r) => sum + r.nights, 0);
  return {
    ...guest,
    reservations: stays,
    stayCount: valid.length,
    completedStays: completed.length,
    totalSpent: paidTotal,
    outstanding: Math.round(outstanding * 100) / 100,
    lastStay: completed[0] || null,
    currentStay: current,
    upcomingStay: upcoming,
    avgStay: completed.length ? totalNights / completed.length : 0,
    returning: valid.length > 1,
  };
}

function overlapNights(res, start, end) {
  const from = res.arrival > start ? res.arrival : start;
  const to = res.departure < addDays(end, 1) ? res.departure : addDays(end, 1);
  return Math.max(0, diffDays(from, to));
}

export function metricsForRange(db, start, end, { outstanding: outstandingOverride } = {}) {
  const days = Math.max(1, diffDays(start, end) + 1);
  const totalBeds = db.beds.length;
  const totalRooms = db.rooms.length;

  const payments = db.payments.filter((p) => p.date >= start && p.date <= end);
  const collected = payments.reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
  const revenue = Math.max(0, collected);
  const refunds = payments
    .filter((p) => p.type === 'refund')
    .reduce((s, p) => s + p.amount, 0);
  const expenses = db.expenses
    .filter((e) => e.date >= start && e.date <= end)
    .reduce((s, e) => s + e.amount, 0);

  const overlapping = db.reservations.filter(
    (r) => !CANCELLED_LIKE.includes(r.status) && r.arrival < addDays(end, 1) && r.departure > start,
  );
  const bedNightsSold = overlapping.reduce((sum, r) => sum + overlapNights(r, start, end), 0);
  const roomRevenue = overlapping.reduce((sum, r) => {
    const stayNights = Math.max(1, nightsBetween(r.arrival, r.departure));
    const nightsInRange = overlapNights(r, start, end);
    const stayTotal = r.rate * stayNights - (r.discount || 0);
    return sum + (stayTotal * nightsInRange) / stayNights;
  }, 0);

  const arrivalsInRange = db.reservations.filter((r) => r.arrival >= start && r.arrival <= end);
  const cancellations = arrivalsInRange.filter((r) => CANCELLED_LIKE.includes(r.status)).length;
  const stays = arrivalsInRange.filter((r) => !CANCELLED_LIKE.includes(r.status));
  const avgStay = stays.length
    ? stays.reduce((sum, r) => sum + nightsBetween(r.arrival, r.departure), 0) / stays.length
    : 0;

  // Callers with a scoped slice pass the portfolio-wide figure from the DB.
  const outstanding =
    outstandingOverride ??
    db.reservations
      .filter((r) => ['confirmed', 'checkedIn', 'pending'].includes(r.status))
      .reduce((sum, r) => {
        const paid = r.paid ?? reservationPaidTotal(r.id, db.payments || []);
        return sum + Math.max(0, r.total - paid);
      }, 0);

  return {
    start,
    end,
    days,
    totalRooms,
    totalBeds,
    revenue: Math.round(revenue * 100) / 100,
    paymentCount: payments.length,
    expenses: Math.round(expenses * 100) / 100,
    netProfit: Math.round((revenue - expenses) * 100) / 100,
    refunds,
    bedNightsSold,
    bedNightsAvailable: totalBeds * days,
    occupancy: totalBeds ? (bedNightsSold / (totalBeds * days)) * 100 : 0,
    adr: bedNightsSold ? roomRevenue / bedNightsSold : 0,
    revpar: totalBeds ? roomRevenue / (totalBeds * days) : 0,
    avgStay,
    bookings: stays.length,
    cancellations,
    cancellationRate: arrivalsInRange.length ? (cancellations / arrivalsInRange.length) * 100 : 0,
    outstanding: Math.round(outstanding * 100) / 100,
  };
}

export function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function cashflowSeries(db, start, end) {
  return eachDay(start, end).map((date) => {
    const revenue = db.payments
      .filter((p) => p.date === date)
      .reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
    const expenses = db.expenses
      .filter((e) => e.date === date)
      .reduce((s, e) => s + e.amount, 0);
    return {
      date,
      revenue: Math.round(Math.max(0, revenue)),
      expenses: Math.round(expenses),
      net: Math.round(revenue - expenses),
    };
  });
}

export function occupancySeries(db, start, end) {
  return eachDay(start, end).map((date) => {
    const occupied = db.reservations.filter(
      (r) =>
        !CANCELLED_LIKE.includes(r.status) &&
        r.status !== 'pending' &&
        r.arrival <= date &&
        r.departure > date,
    ).length;
    return {
      date,
      occupied,
      occupancy: db.beds.length ? Math.round((occupied / db.beds.length) * 100) : 0,
    };
  });
}

export function sourceBreakdown(db, start, end) {
  const reservations = db.reservations.filter(
    (r) => !CANCELLED_LIKE.includes(r.status) && r.arrival >= start && r.arrival <= end,
  );
  const pool = reservations.length
    ? reservations
    : db.reservations.filter((r) => !CANCELLED_LIKE.includes(r.status));
  const map = new Map();
  pool.forEach((r) => {
    map.set(r.source, (map.get(r.source) || 0) + 1);
  });
  const total = pool.length || 1;
  return [...map.entries()]
    .map(([source, count]) => ({ source, count, share: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

export function dashboardSnapshot(db, start, end, options = {}) {
  const metrics = metricsForRange(db, start, end, options);
  const today = todayISO();
  const totalBeds = db.beds.length;
  const enrichedBeds = db.beds.map((bed) => ({ ...bed, status: bedStatus(bed, db) }));
  const occupiedBeds = enrichedBeds.filter((b) => b.status === 'occupied').length;
  const availableBeds = enrichedBeds.filter((b) => b.status === 'available').length;
  const reservedBeds = enrichedBeds.filter((b) => b.status === 'reserved').length;
  const dirtyBeds = enrichedBeds.filter((b) => b.status === 'cleaning').length;

  const inHouse = db.reservations.filter((r) => r.status === 'checkedIn');
  const arrivals = db.reservations
    .filter((r) => r.arrival === today && ['confirmed', 'pending'].includes(r.status))
    .map((r) => enrichReservation(r, db))
    .sort((a, b) => a.guestName.localeCompare(b.guestName));
  const departures = db.reservations
    .filter((r) => r.departure === today && r.status === 'checkedIn')
    .map((r) => enrichReservation(r, db))
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));

  const recent = [...db.reservations]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 6)
    .map((r) => enrichReservation(r, db));

  const pendingReservations =
    options.pendingReservations ?? db.reservations.filter((r) => r.status === 'pending').length;
  const openTasks = db.tasks.filter((t) => t.status !== 'completed').length;
  const outstandingCount =
    options.outstandingCount ??
    db.reservations.filter((r) => {
      if (!['confirmed', 'checkedIn', 'pending'].includes(r.status)) return false;
      return r.total > (r.paid ?? reservationPaidTotal(r.id, db.payments || [])) + 0.009;
    }).length;

  return {
    metrics,
    live: {
      totalBeds,
      occupiedBeds,
      availableBeds,
      reservedBeds,
      dirtyBeds,
      occupancy: totalBeds ? (occupiedBeds / totalBeds) * 100 : 0,
      inHouseStays: inHouse.length,
      inHouseGuests: inHouse.reduce((s, r) => s + (r.guests || 1), 0),
      arrivalsCount: arrivals.length,
      departuresCount: departures.length,
      pendingReservations,
      openTasks,
      outstandingCount,
    },
    arrivals,
    departures,
    recent,
  };
}

/* ----------------------------- Reports module ----------------------------- */

export function monthlySeries(db, months = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(
      endDate.getDate(),
    ).padStart(2, '0')}`;
    buckets.push({ key: `${date.getFullYear()}-${date.getMonth()}`, start, end, date });
  }
  return buckets.map(({ start, end, date }) => {
    const revenue = db.payments
      .filter((p) => p.date >= start && p.date <= end)
      .reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
    const expenses = db.expenses
      .filter((e) => e.date >= start && e.date <= end)
      .reduce((s, e) => s + e.amount, 0);
    const bookings = db.reservations.filter(
      (r) => r.arrival >= start && r.arrival <= end && !CANCELLED_LIKE.includes(r.status),
    ).length;
    const cancellations = db.reservations.filter(
      (r) => r.arrival >= start && r.arrival <= end && CANCELLED_LIKE.includes(r.status),
    ).length;
    return {
      date,
      revenue: Math.round(revenue),
      expenses: Math.round(expenses),
      net: Math.round(revenue - expenses),
      bookings,
      cancellations,
    };
  });
}

export function roomTypePerformance(db, start, end) {
  const types = [...new Set(db.rooms.map((r) => r.type))];
  const bedCounts = types.map((type) => {
    const rooms = db.rooms.filter((r) => r.type === type);
    const bedIds = db.beds.filter((b) => rooms.some((r) => r.id === b.roomId)).map((b) => b.id);
    return { type, bedCount: bedIds.length };
  });
  const revenueTotal = db.payments
    .filter((p) => p.date >= start && p.date <= end && p.type === 'payment')
    .reduce((s, p) => s + p.amount, 0);

  return bedCounts.map(({ type, bedCount }) => {
    const roomIds = db.rooms.filter((r) => r.type === type).map((r) => r.id);
    const reservations = db.reservations.filter(
      (r) =>
        roomIds.includes(r.roomId) &&
        !CANCELLED_LIKE.includes(r.status) &&
        r.arrival < addDays(end, 1) &&
        r.departure > start,
    );
    const nightsSold = reservations.reduce((s, r) => s + overlapNights(r, start, end), 0);
    const revenue = reservations.reduce((sum, r) => {
      const stayNights = Math.max(1, nightsBetween(r.arrival, r.departure));
      return sum + ((r.rate * stayNights - (r.discount || 0)) * overlapNights(r, start, end)) / stayNights;
    }, 0);
    return {
      type,
      beds: bedCount,
      occupancy: bedCount ? (nightsSold / (bedCount * (diffDays(start, end) + 1))) * 100 : 0,
      nightsSold,
      adr: nightsSold ? revenue / nightsSold : 0,
      revpar: bedCount ? revenue / (bedCount * (diffDays(start, end) + 1)) : 0,
      revenue: Math.round(revenue),
      share: revenueTotal ? (revenue / revenueTotal) * 100 : 0,
    };
  });
}

export function expenseBreakdown(db, start, end) {
  const map = new Map();
  db.expenses
    .filter((e) => e.date >= start && e.date <= end)
    .forEach((e) => map.set(e.category, (map.get(e.category) || 0) + e.amount));
  const total = [...map.values()].reduce((s, v) => s + v, 0) || 1;
  return [...map.entries()]
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount),
      share: (amount / total) * 100,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function revenueSummary(db, start, end) {
  const metrics = metricsForRange(db, start, end);
  return {
    ...metrics,
    monthly: monthlySeries(db, 6),
    types: roomTypePerformance(db, start, end),
    expenseBreakdown: expenseBreakdown(db, start, end),
  };
}
