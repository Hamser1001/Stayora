import { ApiError } from './errors';
import { loadDB, mutate, readSession, writeSession, nextId, audit } from '@/data/store';
import {
  bedStatus,
  dashboardSnapshot,
  enrichGuest,
  enrichReservation,
  enrichRoom,
  metricsForRange,
  percentChange,
  cashflowSeries,
  occupancySeries,
  sourceBreakdown,
  monthlySeries,
  roomTypePerformance,
  expenseBreakdown,
} from '@/data/selectors';
import { addDays, diffDays, nightsBetween, todayISO } from '@/lib/dates';
import { CANCELLED } from './shared';

const LATENCY = 260;

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));
}

function fail(message, code, status = 400) {
  throw new ApiError(message, { code, status });
}

function requireSession() {
  const session = readSession();
  if (!session) fail('Your session has expired. Please sign in again.', 'UNAUTHENTICATED', 401);
  return session;
}

function reservationTotal({ rate, arrival, departure, discount = 0 }) {
  return Math.max(0, nightsBetween(arrival, departure) * rate - discount);
}

function hasOverlap(db, { bedId, arrival, departure, excludeId }) {
  return db.reservations.some(
    (r) =>
      r.bedId === bedId &&
      r.id !== excludeId &&
      !CANCELLED.includes(r.status) &&
      r.arrival < departure &&
      arrival < r.departure,
  );
}

function referenceFor(db) {
  let attempt = db.reservations.length + 1;
  let reference = `STY-${(1042 + attempt * 37).toString(36).toUpperCase().padStart(5, '0')}`;
  while (db.reservations.some((r) => r.reference === reference)) {
    attempt += 1;
    reference = `STY-${(1042 + attempt * 37).toString(36).toUpperCase().padStart(5, '0')}`;
  }
  return reference;
}

function sortReservations(list) {
  return list.sort((a, b) => {
    const rank = { checkedIn: 0, confirmed: 1, pending: 2, checkedOut: 3, noShow: 4, cancelled: 5 };
    const byStatus = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    return b.arrival.localeCompare(a.arrival);
  });
}

const mock = {
  mode: 'mock',

  auth: {
    async login({ email, password }) {
      await delay(null);
      if (!email || !password) fail('Enter your email and password.', 'VALIDATION_ERROR');
      if (password.length < 8) {
        fail('Password must be at least 8 characters.', 'VALIDATION_ERROR');
        }
      const db = loadDB();
      const staff = db.staff.find((s) => s.email.toLowerCase() === String(email).toLowerCase());
      const session = {
        token: 'demo-session',
        user: {
          id: staff?.id || 'stf_1',
          name: staff?.name || 'Amina Bensalem',
          email: staff?.email || email,
          role: staff?.role || 'owner',
          initials: (staff?.name || 'Amina Bensalem')
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
        },
        issuedAt: new Date().toISOString(),
      };
      writeSession(session);
      return delay(session);
    },
    async logout() {
      writeSession(null);
      return delay(true);
    },
    async me() {
      return delay(readSession());
    },
  },

  rooms: {
    async list(filters = {}) {
      const db = loadDB();
      let rooms = db.rooms.map((room) => enrichRoom(room, db));
      if (filters.search) {
        const term = filters.search.toLowerCase();
        rooms = rooms.filter(
          (r) => r.number.toLowerCase().includes(term) || r.type.toLowerCase().includes(term),
        );
      }
      if (filters.type && filters.type !== 'all') rooms = rooms.filter((r) => r.type === filters.type);
      if (filters.floor !== undefined && filters.floor !== 'all') {
        rooms = rooms.filter((r) => r.floor === Number(filters.floor));
      }
      if (filters.status && filters.status !== 'all') {
        rooms = rooms.filter((r) => r.beds.some((b) => b.status === filters.status));
      }
      rooms.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
      return delay(rooms);
    },
    async get(id) {
      const db = loadDB();
      const room = db.rooms.find((r) => r.id === id);
      if (!room) fail('Room not found.', 'NOT_FOUND', 404);
      return delay(enrichRoom(room, db));
    },
    async create(payload) {
      requireSession();
      return delay(
        mutate((db) => {
          const duplicate = db.rooms.some(
            (r) => r.number.toLowerCase() === String(payload.number).trim().toLowerCase(),
          );
          if (duplicate) fail('That room number already exists.', 'DUPLICATE_ROOM');
          const room = {
            id: nextId('rom', db.rooms),
            number: String(payload.number).trim(),
            type: payload.type,
            audience: payload.audience || 'mixed',
            floor: Number(payload.floor),
            bedCount: Number(payload.bedCount),
            pricePerBed: Number(payload.pricePerBed),
            amenities: payload.amenities || [],
            notes: payload.notes || '',
            createdAt: todayISO(),
          };
          db.rooms.push(room);
          for (let i = 0; i < room.bedCount; i += 1) {
            db.beds.push({
              id: `bed_${room.number}_${i + 1}`,
              roomId: room.id,
              number: i + 1,
              label: `${room.number}-${String.fromCharCode(65 + i)}`,
              cleaning: false,
              maintenance: false,
              outOfService: false,
              note: '',
            });
          }
          audit(db, 'room.created', 'room', room.id, { number: room.number });
          return enrichRoom(room, db);
        }),
      );
    },
    async update(id, payload) {
      requireSession();
      return delay(
        mutate((db) => {
          const room = db.rooms.find((r) => r.id === id);
          if (!room) fail('Room not found.', 'NOT_FOUND', 404);
          const duplicate = db.rooms.some(
            (r) =>
              r.id !== id &&
              r.number.toLowerCase() === String(payload.number ?? room.number).trim().toLowerCase(),
          );
          if (duplicate) fail('That room number already exists.', 'DUPLICATE_ROOM');

          const nextBedCount = Number(payload.bedCount ?? room.bedCount);
          const roomBeds = db.beds.filter((b) => b.roomId === room.id);
          if (nextBedCount < roomBeds.length) {
            const removable = roomBeds.slice(nextBedCount);
            const blocked = removable.find((bed) =>
              db.reservations.some(
                (r) => r.bedId === bed.id && ['confirmed', 'checkedIn', 'pending'].includes(r.status),
              ),
            );
            if (blocked) {
              fail('Beds with active reservations cannot be removed.', 'BED_HAS_ACTIVE_RESERVATION');
            }
            db.beds = db.beds.filter((b) => !removable.some((r) => r.id === b.id));
          }
          if (nextBedCount > roomBeds.length) {
            for (let i = roomBeds.length; i < nextBedCount; i += 1) {
              db.beds.push({
                id: `bed_${room.number}_${i + 1}`,
                roomId: room.id,
                number: i + 1,
                label: `${payload.number || room.number}-${String.fromCharCode(65 + i)}`,
                cleaning: false,
                maintenance: false,
                outOfService: false,
                note: '',
              });
            }
          }
          Object.assign(room, {
            number: String(payload.number ?? room.number).trim(),
            type: payload.type ?? room.type,
            audience: payload.audience ?? room.audience,
            floor: Number(payload.floor ?? room.floor),
            bedCount: nextBedCount,
            pricePerBed: Number(payload.pricePerBed ?? room.pricePerBed),
            amenities: payload.amenities ?? room.amenities,
            notes: payload.notes ?? room.notes,
          });
          audit(db, 'room.updated', 'room', room.id, { number: room.number });
          return enrichRoom(room, db);
        }),
      );
    },
    async remove(id) {
      requireSession();
      return delay(
        mutate((db) => {
          const room = db.rooms.find((r) => r.id === id);
          if (!room) fail('Room not found.', 'NOT_FOUND', 404);
          const bedIds = db.beds.filter((b) => b.roomId === id).map((b) => b.id);
          const active = db.reservations.some(
            (r) => bedIds.includes(r.bedId) && ['confirmed', 'checkedIn', 'pending'].includes(r.status),
          );
          if (active) {
            fail('This room has active reservations and cannot be deleted.', 'ROOM_HAS_ACTIVE_RESERVATIONS');
          }
          const removedReservations = db.reservations
            .filter((r) => r.roomId === id)
            .map((r) => r.id);
          db.payments = db.payments.filter((p) => !removedReservations.includes(p.reservationId));
          db.reservations = db.reservations.filter((r) => r.roomId !== id);
          db.tasks = db.tasks.filter((t) => t.roomId !== id);
          db.beds = db.beds.filter((b) => b.roomId !== id);
          db.rooms = db.rooms.filter((r) => r.id !== id);
          audit(db, 'room.deleted', 'room', id, { number: room.number });
          return { id };
        }),
      );
    },
    async updateBed(id, patch) {
      requireSession();
      return delay(
        mutate((db) => {
          const bed = db.beds.find((b) => b.id === id);
          if (!bed) fail('Bed not found.', 'NOT_FOUND', 404);
          const occupied = db.reservations.some((r) => r.bedId === id && r.status === 'checkedIn');
          if (occupied && patch.status && patch.status !== 'occupied') {
            fail('Check the guest out before changing this bed.', 'BED_OCCUPIED');
          }
          if (patch.status === 'available') {
            bed.cleaning = false;
            bed.maintenance = false;
            bed.outOfService = false;
          }
          if (patch.status === 'cleaning') {
            bed.cleaning = true;
            bed.maintenance = false;
            bed.outOfService = false;
          }
          if (patch.status === 'maintenance') {
            bed.cleaning = false;
            bed.maintenance = true;
            bed.outOfService = false;
          }
          if (patch.status === 'inactive') {
            bed.cleaning = false;
            bed.maintenance = false;
            bed.outOfService = true;
          }
          if (typeof patch.note === 'string') bed.note = patch.note;
          audit(db, 'bed.status_changed', 'bed', id, { status: patch.status });
          const room = db.rooms.find((r) => r.id === bed.roomId);
          return { ...bed, status: bedStatus(bed, db), room: enrichRoom(room, db) };
        }),
      );
    },
  },

  reservations: {
    async list(filters = {}) {
      const db = loadDB();
      let list = db.reservations.map((r) => enrichReservation(r, db));
      if (filters.search) {
        const term = filters.search.toLowerCase();
        list = list.filter(
          (r) =>
            r.reference.toLowerCase().includes(term) ||
            r.guest?.name.toLowerCase().includes(term) ||
            r.roomNumber.toLowerCase().includes(term),
        );
      }
      if (filters.status && filters.status !== 'all') {
        list = list.filter((r) => r.status === filters.status);
      }
      if (filters.source && filters.source !== 'all') {
        list = list.filter((r) => r.source === filters.source);
      }
      if (filters.from) list = list.filter((r) => r.departure > filters.from);
      if (filters.to) list = list.filter((r) => r.arrival < addDays(filters.to, 1));
      if (filters.roomId) list = list.filter((r) => r.roomId === filters.roomId);
      sortReservations(list);
      return delay(list);
    },
    async get(id) {
      const db = loadDB();
      const reservation = db.reservations.find((r) => r.id === id);
      if (!reservation) fail('Reservation not found.', 'NOT_FOUND', 404);
      return delay(enrichReservation(reservation, db));
    },
    async calendar({ start, end }) {
      const db = loadDB();
      const list = db.reservations
        .filter((r) => !CANCELLED.includes(r.status) && r.arrival < addDays(end, 1) && r.departure > start)
        .map((r) => enrichReservation(r, db));
      return delay({ reservations: list, start, end });
    },
    async availability({ arrival, departure, roomId }) {
      const db = loadDB();
      if (!arrival || !departure || departure <= arrival) return delay([]);
      const occupied = new Set(
        db.reservations
          .filter((r) => !CANCELLED.includes(r.status) && r.arrival < departure && arrival < r.departure)
          .map((r) => r.bedId),
      );
      const beds = db.beds
        .filter((b) => (roomId ? b.roomId === roomId : true))
        .filter((b) => !b.maintenance && !b.outOfService && !occupied.has(b.id))
        .map((b) => {
          const room = db.rooms.find((r) => r.id === b.roomId);
          return {
            id: b.id,
            label: b.label,
            roomId: room.id,
            roomNumber: room.number,
            roomType: room.type,
            audience: room.audience,
            floor: room.floor,
            pricePerBed: room.pricePerBed,
            status: bedStatus(b, db),
          };
        })
        .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
      return delay(beds);
    },
    async create(payload) {
      const session = requireSession();
      return delay(
        mutate((db) => {
          const { arrival, departure, guestId, roomId, bedId, rate, discount = 0, source, guests } = payload;
          if (!arrival || !departure || departure <= arrival) {
            fail('Departure must be after arrival.', 'INVALID_DATES');
          }
          const guest = db.guests.find((g) => g.id === guestId);
          if (!guest) fail('Select a guest for this reservation.', 'GUEST_REQUIRED');
          const room = db.rooms.find((r) => r.id === roomId);
          const bed = db.beds.find((b) => b.id === bedId && b.roomId === roomId);
          if (!room || !bed) fail('Select an available bed.', 'BED_REQUIRED');
          if (bed.maintenance || bed.outOfService) {
            fail('That bed is not available for booking.', 'BED_UNAVAILABLE');
          }
          if (hasOverlap(db, { bedId, arrival, departure })) {
            fail('This bed is already booked for the selected dates.', 'BED_OVERLAP', 409);
          }
          const roomBeds = db.beds.filter((b) => b.roomId === roomId).length;
          if (Number(guests) > Math.max(1, roomBeds)) {
            fail('This room cannot host that many guests.', 'TOO_MANY_GUESTS');
          }
          const reservation = {
            id: nextId('res', db.reservations),
            reference: referenceFor(db),
            guestId,
            roomId,
            bedId,
            arrival,
            departure,
            guests: Number(guests) || 1,
            rate: Number(rate) || room.pricePerBed,
            discount: Number(discount) || 0,
            total: reservationTotal({
              rate: Number(rate) || room.pricePerBed,
              arrival,
              departure,
              discount: Number(discount) || 0,
            }),
            source: source || 'direct',
            status: payload.status || 'confirmed',
            notes: payload.notes || '',
            createdAt: new Date().toISOString(),
            createdBy: session.user.name,
          };
          db.reservations.push(reservation);
          if (Number(payload.deposit) > 0) {
            db.payments.push({
              id: nextId('pay', db.payments),
              reservationId: reservation.id,
              guestId,
              amount: Math.min(Number(payload.deposit), reservation.total),
              method: payload.depositMethod || 'card',
              type: 'payment',
              date: todayISO(),
              reference: `PMT-${Date.now().toString().slice(-6)}`,
              createdAt: new Date().toISOString(),
            });
          }
          audit(db, 'reservation.created', 'reservation', reservation.id, {
            reference: reservation.reference,
          });
          return enrichReservation(reservation, db);
        }),
      );
    },
    async update(id, payload) {
      requireSession();
      return delay(
        mutate((db) => {
          const reservation = db.reservations.find((r) => r.id === id);
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
          if (hasOverlap(db, { bedId: next.bedId, arrival: next.arrival, departure: next.departure, excludeId: id })) {
            fail('This bed is already booked for the selected dates.', 'BED_OVERLAP', 409);
          }
          next.total = reservationTotal(next);
          Object.assign(reservation, next);
          audit(db, 'reservation.updated', 'reservation', id, { reference: reservation.reference });
          return enrichReservation(reservation, db);
        }),
      );
    },
    async setStatus(id, status) {
      requireSession();
      return delay(
        mutate((db) => {
          const reservation = db.reservations.find((r) => r.id === id);
          if (!reservation) fail('Reservation not found.', 'NOT_FOUND', 404);
          const bed = db.beds.find((b) => b.id === reservation.bedId);

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
          if (status === 'checkedIn') {
            const occupied = db.reservations.some(
              (r) => r.bedId === reservation.bedId && r.id !== id && r.status === 'checkedIn',
            );
            if (occupied) fail('That bed is already occupied.', 'BED_OCCUPIED', 409);
            if (bed?.maintenance || bed?.outOfService) {
              fail('That bed is out of service.', 'BED_UNAVAILABLE');
            }
            if (bed) bed.cleaning = false;
          }
          if (status === 'checkedOut') {
            if (bed) bed.cleaning = true;
          }
          if (['cancelled', 'noShow'].includes(status) && bed) {
            bed.cleaning = bed.cleaning || false;
          }
          reservation.status = status;
          reservation.updatedAt = new Date().toISOString();
          if (status === 'checkedIn') reservation.checkedInAt = new Date().toISOString();
          if (status === 'checkedOut') reservation.checkedOutAt = new Date().toISOString();
          audit(db, `reservation.${status}`, 'reservation', id, { reference: reservation.reference });
          return enrichReservation(reservation, db);
        }),
      );
    },
  },

  guests: {
    async list(filters = {}) {
      const db = loadDB();
      let guests = db.guests.map((g) => enrichGuest(g, db));
      if (filters.search) {
        const term = filters.search.toLowerCase();
        guests = guests.filter(
          (g) =>
            g.name.toLowerCase().includes(term) ||
            g.email.toLowerCase().includes(term) ||
            g.phone.includes(term),
        );
      }
      if (filters.filter === 'inHouse') guests = guests.filter((g) => g.currentStay);
      if (filters.filter === 'upcoming') guests = guests.filter((g) => g.upcomingStay);
      if (filters.filter === 'balance') guests = guests.filter((g) => g.outstanding > 0);
      guests.sort((a, b) => a.name.localeCompare(b.name));
      return delay(guests);
    },
    async get(id) {
      const db = loadDB();
      const guest = db.guests.find((g) => g.id === id);
      if (!guest) fail('Guest not found.', 'NOT_FOUND', 404);
      return delay(enrichGuest(guest, db));
    },
    async create(payload) {
      requireSession();
      return delay(
        mutate((db) => {
          const guest = {
            id: nextId('gst', db.guests),
            name: String(payload.name).trim(),
            email: payload.email || '',
            phone: payload.phone || '',
            nationality: payload.nationality || '',
            idType: payload.idType || 'passport',
            idNumber: payload.idNumber || '',
            notes: payload.notes || '',
            createdAt: todayISO(),
          };
          if (!guest.name) fail('Guest name is required.', 'VALIDATION_ERROR');
          db.guests.push(guest);
          audit(db, 'guest.created', 'guest', guest.id, { name: guest.name });
          return enrichGuest(guest, db);
        }),
      );
    },
    async update(id, payload) {
      requireSession();
      return delay(
        mutate((db) => {
          const guest = db.guests.find((g) => g.id === id);
          if (!guest) fail('Guest not found.', 'NOT_FOUND', 404);
          Object.assign(guest, payload);
          audit(db, 'guest.updated', 'guest', id, { name: guest.name });
          return enrichGuest(guest, db);
        }),
      );
    },
  },

  payments: {
    async list(filters = {}) {
      const db = loadDB();
      let list = db.payments.map((p) => {
        const reservation = db.reservations.find((r) => r.id === p.reservationId);
        const guest = db.guests.find((g) => g.id === reservation?.guestId);
        return {
          ...p,
          guestName: guest?.name || '—',
          reservationReference: reservation?.reference || '—',
          roomNumber: db.rooms.find((r) => r.id === reservation?.roomId)?.number || '—',
        };
      });
      if (filters.search) {
        const term = filters.search.toLowerCase();
        list = list.filter(
          (p) =>
            p.guestName.toLowerCase().includes(term) ||
            p.reference.toLowerCase().includes(term) ||
            p.reservationReference.toLowerCase().includes(term),
        );
      }
      if (filters.method && filters.method !== 'all') list = list.filter((p) => p.method === filters.method);
      if (filters.from) list = list.filter((p) => p.date >= filters.from);
      if (filters.to) list = list.filter((p) => p.date <= filters.to);
      list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      return delay(list);
    },
    async create(payload) {
      const session = requireSession();
      return delay(
        mutate((db) => {
          const reservation = db.reservations.find((r) => r.id === payload.reservationId);
          if (!reservation) fail('Choose a reservation.', 'RESERVATION_REQUIRED');
          const amount = Number(payload.amount);
          if (!(amount > 0)) fail('Enter an amount greater than zero.', 'INVALID_AMOUNT');
          const paid = db.payments
            .filter((p) => p.reservationId === reservation.id)
            .reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
          const balance = Math.max(0, reservation.total - paid);
          if (amount > balance + 0.01) {
            fail('The payment is higher than the outstanding balance.', 'OVERPAYMENT');
          }
          const payment = {
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
            createdBy: session.user.name,
          };
          db.payments.push(payment);
          audit(db, 'payment.recorded', 'payment', payment.id, { amount });
          return { ...payment, balanceAfter: Math.max(0, balance - amount) };
        }),
      );
    },
    async refund({ reservationId, amount, method }) {
      requireSession();
      return delay(
        mutate((db) => {
          const reservation = db.reservations.find((r) => r.id === reservationId);
          if (!reservation) fail('Reservation not found.', 'NOT_FOUND', 404);
          const paid = db.payments
            .filter((p) => p.reservationId === reservationId)
            .reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
          const refundAmount = Number(amount);
          if (!(refundAmount > 0) || refundAmount > paid + 0.01) {
            fail('Refund exceeds the amount collected.', 'INVALID_REFUND');
          }
          const refund = {
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
          };
          db.payments.push(refund);
          audit(db, 'payment.refunded', 'payment', refund.id, { amount: refundAmount });
          return refund;
        }),
      );
    },
    async summary({ start, end }) {
      const db = loadDB();
      const list = db.payments.filter((p) => p.date >= start && p.date <= end);
      const collected = list
        .filter((p) => p.type === 'payment')
        .reduce((s, p) => s + p.amount, 0);
      const refunds = list.filter((p) => p.type === 'refund').reduce((s, p) => s + p.amount, 0);
      const outstanding = db.reservations
        .filter((r) => ['confirmed', 'checkedIn', 'pending'].includes(r.status))
        .reduce((sum, r) => {
          const paid = db.payments
            .filter((p) => p.reservationId === r.id)
            .reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
          return sum + Math.max(0, r.total - paid);
        }, 0);
      const today = todayISO();
      const dueToday = db.reservations
        .filter((r) => r.arrival === today && !CANCELLED.includes(r.status))
        .reduce((sum, r) => {
          const paid = db.payments
            .filter((p) => p.reservationId === r.id)
            .reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
          return sum + Math.max(0, r.total - paid);
        }, 0);
      return delay({
        collected,
        refunds,
        net: collected - refunds,
        outstanding: Math.round(outstanding),
        dueToday: Math.round(dueToday),
        count: list.length,
        avg: list.length ? (collected - refunds) / list.length : 0,
      });
    },
  },

  expenses: {
    async list(filters = {}) {
      const db = loadDB();
      let list = [...db.expenses];
      if (filters.search) {
        const term = filters.search.toLowerCase();
        list = list.filter(
          (e) => e.vendor.toLowerCase().includes(term) || e.category.toLowerCase().includes(term),
        );
      }
      if (filters.category && filters.category !== 'all') {
        list = list.filter((e) => e.category === filters.category);
      }
      if (filters.from) list = list.filter((e) => e.date >= filters.from);
      if (filters.to) list = list.filter((e) => e.date <= filters.to);
      list.sort((a, b) => b.date.localeCompare(a.date));
      return delay(list);
    },
    async create(payload) {
      requireSession();
      return delay(
        mutate((db) => {
          const expense = {
            id: nextId('exp', db.expenses),
            category: payload.category,
            vendor: String(payload.vendor || '').trim(),
            date: payload.date || todayISO(),
            amount: Number(payload.amount),
            method: payload.method || 'card',
            receipt: payload.receipt || '',
            notes: payload.notes || '',
            createdAt: new Date().toISOString(),
          };
          if (!expense.vendor) fail('Enter the vendor name.', 'VALIDATION_ERROR');
          if (!(expense.amount > 0)) fail('Enter an amount greater than zero.', 'INVALID_AMOUNT');
          db.expenses.push(expense);
          audit(db, 'expense.created', 'expense', expense.id, { amount: expense.amount });
          return expense;
        }),
      );
    },
    async remove(id) {
      requireSession();
      return delay(
        mutate((db) => {
          const exists = db.expenses.some((e) => e.id === id);
          if (!exists) fail('Expense not found.', 'NOT_FOUND', 404);
          db.expenses = db.expenses.filter((e) => e.id !== id);
          audit(db, 'expense.deleted', 'expense', id);
          return { id };
        }),
      );
    },
    async summary({ start, end }) {
      const db = loadDB();
      const list = db.expenses.filter((e) => e.date >= start && e.date <= end);
      const total = list.reduce((s, e) => s + e.amount, 0);
      const byCategory = expenseBreakdown(db, start, end);
      return delay({
        total,
        count: list.length,
        avg: list.length ? total / list.length : 0,
        largest: byCategory[0] || null,
        byCategory,
      });
    },
  },

  housekeeping: {
    async list(filters = {}) {
      const db = loadDB();
      let tasks = db.tasks.map((t) => ({
        ...t,
        roomNumber: db.rooms.find((r) => r.id === t.roomId)?.number || '—',
        assignee: db.staff.find((s) => s.id === t.assigneeId) || null,
      }));
      if (filters.assigneeId) tasks = tasks.filter((t) => t.assigneeId === filters.assigneeId);
      tasks.sort((a, b) => {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] ?? 9) - (order[b.priority] ?? 9) || a.due.localeCompare(b.due);
      });
      return delay(tasks);
    },
    async create(payload) {
      requireSession();
      return delay(
        mutate((db) => {
          const task = {
            id: nextId('tsk', db.tasks),
            type: payload.type || 'cleaning',
            title: String(payload.title || '').trim(),
            roomId: payload.roomId,
            priority: payload.priority || 'medium',
            status: 'open',
            assigneeId: payload.assigneeId || null,
            due: payload.due || todayISO(),
            description: payload.description || '',
            createdAt: new Date().toISOString(),
          };
          if (!task.title) fail('Give the task a short title.', 'VALIDATION_ERROR');
          if (!task.roomId) fail('Choose a room.', 'VALIDATION_ERROR');
          db.tasks.push(task);
          if (task.type === 'cleaning') {
            const room = db.rooms.find((r) => r.id === task.roomId);
            db.beds
              .filter((b) => b.roomId === task.roomId)
              .forEach((b) => {
                if (!b.maintenance && !b.outOfService) b.cleaning = true;
              });
            if (room) audit(db, 'task.created', 'task', task.id, { room: room.number });
          }
          return task;
        }),
      );
    },
    async update(id, patch) {
      requireSession();
      return delay(
        mutate((db) => {
          const task = db.tasks.find((t) => t.id === id);
          if (!task) fail('Task not found.', 'NOT_FOUND', 404);
          Object.assign(task, patch);
          if (patch.status === 'completed' && task.type === 'cleaning') {
            db.beds
              .filter((b) => b.roomId === task.roomId && !b.maintenance && !b.outOfService)
              .forEach((b) => {
                b.cleaning = false;
              });
          }
          audit(db, 'task.updated', 'task', id, { status: task.status });
          return task;
        }),
      );
    },
  },

  staff: {
    async list() {
      const db = loadDB();
      return delay([...db.staff].sort((a, b) => a.name.localeCompare(b.name)));
    },
    async invite(payload) {
      requireSession();
      return delay(
        mutate((db) => {
          if (db.staff.some((s) => s.email.toLowerCase() === String(payload.email).toLowerCase())) {
            fail('That email already belongs to a team member.', 'DUPLICATE_MEMBER');
          }
          const member = {
            id: nextId('stf', db.staff),
            name: String(payload.name || '').trim(),
            email: String(payload.email || '').trim(),
            role: payload.role || 'receptionist',
            status: 'invited',
            lastActive: null,
            invitedAt: new Date().toISOString(),
          };
          if (!member.name || !member.email) fail('Name and email are required.', 'VALIDATION_ERROR');
          db.staff.push(member);
          audit(db, 'staff.invited', 'staff', member.id, { email: member.email });
          return member;
        }),
      );
    },
    async update(id, patch) {
      requireSession();
      return delay(
        mutate((db) => {
          const member = db.staff.find((s) => s.id === id);
          if (!member) fail('Member not found.', 'NOT_FOUND', 404);
          if (member.role === 'owner' && patch.role && patch.role !== 'owner') {
            fail('The owner role cannot be changed.', 'OWNER_LOCKED');
          }
          Object.assign(member, patch);
          audit(db, 'staff.updated', 'staff', id, patch);
          return member;
        }),
      );
    },
    async remove(id) {
      requireSession();
      return delay(
        mutate((db) => {
          const member = db.staff.find((s) => s.id === id);
          if (!member) fail('Member not found.', 'NOT_FOUND', 404);
          if (member.role === 'owner') fail('The owner account cannot be removed.', 'OWNER_LOCKED');
          db.staff = db.staff.filter((s) => s.id !== id);
          audit(db, 'staff.removed', 'staff', id, { email: member.email });
          return { id };
        }),
      );
    },
  },

  dashboard: {
    async get({ start, end }) {
      const db = loadDB();
      const previousStart = addDays(start, -diffDays(start, end) - 1);
      const previousEnd = addDays(start, -1);
      const previous = metricsForRange(db, previousStart, previousEnd);
      const snapshot = dashboardSnapshot(db, start, end);
      const series = cashflowSeries(db, start, end);
      const occupancy = occupancySeries(db, start, end);
      const sources = sourceBreakdown(db, start, end);
      return delay({
        ...snapshot,
        series,
        occupancy,
        sources,
        previous,
        deltas: {
          revenue: percentChange(snapshot.metrics.revenue, previous.revenue),
          expenses: percentChange(snapshot.metrics.expenses, previous.expenses),
          occupancy: snapshot.live.occupancy - previous.occupancy,
          adr: percentChange(snapshot.metrics.adr, previous.adr),
        },
      });
    },
  },

  reports: {
    async get({ start, end }) {
      const db = loadDB();
      const metrics = metricsForRange(db, start, end);
      const previousStart = addDays(start, -diffDays(start, end) - 1);
      const previous = metricsForRange(db, previousStart, addDays(start, -1));
      const types = roomTypePerformance(db, start, end);
      const expenses = expenseBreakdown(db, start, end);
      const strongest = [...types].sort((a, b) => b.occupancy - a.occupancy)[0];
      return delay({
        metrics,
        previous,
        deltas: {
          revenue: percentChange(metrics.revenue, previous.revenue),
          expenses: percentChange(metrics.expenses, previous.expenses),
          netProfit: percentChange(metrics.netProfit, previous.netProfit),
          occupancy: metrics.occupancy - previous.occupancy,
          adr: percentChange(metrics.adr, previous.adr),
          revpar: percentChange(metrics.revpar, previous.revpar),
          avgStay: percentChange(metrics.avgStay, previous.avgStay),
          cancellationRate: metrics.cancellationRate - previous.cancellationRate,
        },
        monthly: monthlySeries(db, 6),
        types,
        expenses,
        insight: {
          strongestType: strongest?.type || null,
          strongestOccupancy: strongest?.occupancy || 0,
          outstanding: metrics.outstanding,
          largestCategory: expenses[0]?.category || null,
        },
      });
    },
  },

  settings: {
    async get() {
      const db = loadDB();
      return delay({ ...db.settings });
    },
    async update(patch) {
      requireSession();
      return delay(
        mutate((db) => {
          db.settings = { ...db.settings, ...patch };
          audit(db, 'settings.updated', 'settings', 'workspace', patch);
          return { ...db.settings };
        }),
      );
    },
    async reset() {
      const { resetDB } = await import('@/data/store');
      const db = resetDB();
      return delay({ ...db.settings });
    },
  },

  notifications: {
    async list() {
      const db = loadDB();
      return delay([...db.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
    async markAllRead() {
      return delay(
        mutate((db) => {
          db.notifications.forEach((n) => {
            n.read = true;
          });
          return db.notifications;
        }),
      );
    },
  },
};

/* ------------------------- server-driven list contract ------------------------ */
/* The mock keeps everything in memory, but exposes the same {data, meta} shape. */
function mockPage(rows, params = {}, counts) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 12));
  const start = (page - 1) * pageSize;
  return {
    data: rows.slice(start, start + pageSize),
    meta: {
      page,
      pageSize,
      total: rows.length,
      pages: Math.max(1, Math.ceil(rows.length / pageSize)),
      ...(counts ? { counts } : {}),
    },
  };
}

mock.reservations.listPage = async (params = {}) => {
  const rows = await mock.reservations.list(params);
  const all = await mock.reservations.list();
  const today = todayISO();
  return mockPage(rows, params, {
    arrivals: all.filter((r) => r.arrival === today && ['confirmed', 'pending'].includes(r.status)).length,
    departures: all.filter((r) => r.departure === today && r.status === 'checkedIn').length,
    inHouse: all.filter((r) => r.status === 'checkedIn').length,
    pending: all.filter((r) => r.status === 'pending').length,
  });
};

mock.reservations.outstanding = async () =>
  (await mock.reservations.list()).filter(
    (r) => r.balance > 0 && ['pending', 'confirmed', 'checkedIn'].includes(r.status),
  );

mock.guests.listPage = async (params = {}) => {
  const rows = await mock.guests.list(params);
  const all = await mock.guests.list();
  return mockPage(rows, params, {
    all: all.length,
    inHouse: all.filter((g) => g.currentStay).length,
    upcoming: all.filter((g) => g.upcomingStay).length,
    balance: all.filter((g) => g.outstanding > 0).length,
  });
};

mock.guests.options = async () =>
  (await mock.guests.list()).map(({ id, name, email, phone }) => ({ id, name, email, phone }));

mock.payments.listPage = async (params = {}) => mockPage(await mock.payments.list(params), params);
mock.expenses.listPage = async (params = {}) => mockPage(await mock.expenses.list(params), params);

export default mock;
