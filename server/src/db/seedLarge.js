import bcrypt from 'bcryptjs';
import { models } from './models.js';
import { addDays, nightsBetween, toISODate, todayISO } from '../lib/dates.js';

/* ------------------------------ deterministic RNG ----------------------------- */

function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Amara', 'Lucas', 'Sofia', 'Yuki', 'Emma', 'Noah', 'Priya', 'Mateo', 'Chloé', 'Liam',
  'Fatima', 'Jonas', 'Isabella', 'Ethan', 'Mei', 'Adam', 'Leila', 'Tomás', 'Hannah', 'Daniel',
  'Nora', 'Rafael', 'Zara', 'Oliver', 'Inès', 'Kai', 'Elena', 'Hugo', 'Aisha', 'Marco',
  'Julia', 'Omar', 'Freya', 'Diego', 'Sakura', 'Ivan', 'Camille', 'Samir', 'Ada', 'Theo',
  'Nadia', 'Felix', 'Ava', 'Ravi', 'Laura', 'Kenji', 'Maya', 'Pablo', 'Sara', 'Anton',
];

const LAST_NAMES = [
  'Okafor', 'Meyer', 'Rossi', 'Tanaka', 'Dubois', 'Williams', 'Sharma', 'García', 'Martin', 'O’Connor',
  'Zahra', 'Weber', 'Costa', 'Clarke', 'Lin', 'Novák', 'Haddad', 'Silva', 'Berg', 'Kim',
  'Jensen', 'Mendes', 'Ahmed', 'Smith', 'Laurent', 'Müller', 'Petrova', 'Moreau', 'Diallo', 'Bianchi',
  'Kowalski', 'Fischer', 'Nguyen', 'Alvarez', 'Sato', 'Popescu', 'Lefèvre', 'Hassan', 'Lindqvist', 'Papadopoulos',
];

const NATIONALITIES = [
  ['France', '+33'], ['Germany', '+49'], ['Italy', '+39'], ['Japan', '+81'], ['United States', '+1'],
  ['India', '+91'], ['Spain', '+34'], ['Brazil', '+55'], ['United Kingdom', '+44'], ['Morocco', '+212'],
  ['South Korea', '+82'], ['Portugal', '+351'], ['Sweden', '+46'], ['Ireland', '+353'], ['Nigeria', '+234'],
  ['Australia', '+61'], ['Canada', '+1'], ['Poland', '+48'], ['Netherlands', '+31'], ['Mexico', '+52'],
];

const SOURCES = [
  ['direct', 0.2], ['walkIn', 0.08], ['website', 0.19], ['phone', 0.05],
  ['bookingCom', 0.24], ['hostelworld', 0.12], ['airbnb', 0.08], ['agent', 0.04],
];

const METHODS = [['cash', 0.18], ['card', 0.47], ['transfer', 0.2], ['online', 0.15]];

const EXPENSE_CATEGORIES = ['salaries', 'electricity', 'water', 'internet', 'cleaning', 'supplies', 'maintenance', 'marketing', 'other'];
const VENDORS = {
  salaries: 'Team payroll',
  electricity: 'City Power & Light',
  water: 'Aqua Municipal',
  internet: 'Fiberline Business',
  cleaning: 'Fresh Linen Co.',
  supplies: 'Hostel Supply Hub',
  maintenance: 'Atelier Réparations',
  marketing: 'Meta Ads',
  other: 'Guest welcome baskets',
};

const ROOM_TYPES = [
  { type: 'dorm', audience: 'mixed', beds: 6, price: 29, amenities: ['wifi', 'lockers', 'window'] },
  { type: 'dorm', audience: 'female', beds: 6, price: 31, amenities: ['wifi', 'lockers', 'balcony'] },
  { type: 'dorm', audience: 'male', beds: 8, price: 26, amenities: ['wifi', 'lockers', 'desk'] },
  { type: 'private', audience: 'mixed', beds: 1, price: 84, amenities: ['wifi', 'privateBathroom', 'desk'] },
  { type: 'twin', audience: 'mixed', beds: 2, price: 44, amenities: ['wifi', 'desk', 'airConditioning'] },
  { type: 'family', audience: 'mixed', beds: 4, price: 36, amenities: ['wifi', 'privateBathroom', 'window'] },
  { type: 'suite', audience: 'mixed', beds: 1, price: 132, amenities: ['wifi', 'privateBathroom', 'airConditioning', 'balcony'] },
];

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function pickWeighted(random, pairs) {
  const roll = random();
  let sum = 0;
  for (const [value, weight] of pairs) {
    sum += weight;
    if (roll <= sum) return value;
  }
  return pairs[pairs.length - 1][0];
}

function weightedNights(random) {
  const roll = random();
  if (roll < 0.34) return 1;
  if (roll < 0.62) return 2;
  if (roll < 0.82) return 3;
  if (roll < 0.92) return 4;
  if (roll < 0.97) return 5;
  return 6 + Math.floor(random() * 5);
}

async function insertInBatches(model, docs, batchSize = 1000) {
  for (let index = 0; index < docs.length; index += batchSize) {
    await model.insertMany(docs.slice(index, index + batchSize), { ordered: false });
  }
}

/**
 * Builds a interconnected, deterministic workspace of ~40k documents:
 * rooms/beds → guests → reservations → payments/expenses/tasks/notifications.
 * Ids, references and paid totals stay consistent across collections.
 */
export function buildLargeSeed({ seed = 20261116 } = {}) {
  const random = mulberry32(seed);
  const today = todayISO();
  const START = addDays(today, -520);
  const END = addDays(today, 430);

  /* ---------------------------------- rooms --------------------------------- */
  const rooms = [];
  const beds = [];
  let roomIndex = 0;
  for (let floor = 1; floor <= 6; floor += 1) {
    for (let slot = 1; slot <= 10; slot += 1) {
      const template = ROOM_TYPES[(floor + slot) % ROOM_TYPES.length];
      roomIndex += 1;
      const number = `${floor}${String(slot).padStart(2, '0')}`;
      const id = `rom_${roomIndex}`;
      const pricePerBed = template.price + Math.round(random() * 8);
      rooms.push({
        id,
        number,
        type: template.type,
        audience: template.audience,
        floor: floor - 1,
        bedCount: template.beds,
        pricePerBed,
        amenities: template.amenities,
        notes: template.type === 'suite' ? 'Corner suite with skyline view.' : '',
        createdAt: addDays(today, -900 + roomIndex),
      });
      for (let bedIndex = 0; bedIndex < template.beds; bedIndex += 1) {
        beds.push({
          id: `bed_${number}_${bedIndex + 1}`,
          roomId: id,
          number: bedIndex + 1,
          label: `${number}-${String.fromCharCode(65 + bedIndex)}`,
          cleaning: false,
          maintenance: false,
          outOfService: false,
          note: '',
        });
      }
    }
  }

  // A little physical housekeeping variety.
  beds.forEach((bed, index) => {
    if (index % 97 === 0) {
      bed.maintenance = true;
      bed.note = 'Shower head leaking — plumber booked.';
    } else if (index % 143 === 0) {
      bed.outOfService = true;
      bed.note = 'Frame damaged, replacement ordered.';
    }
  });

  /* --------------------------------- guests --------------------------------- */
  const guests = [];
  const usedEmails = new Set();
  for (let index = 0; index < 900; index += 1) {
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const last = LAST_NAMES[(index * 7 + Math.floor(index / 13)) % LAST_NAMES.length];
    const [nationality, dial] = NATIONALITIES[index % NATIONALITIES.length];
    const name = `${first} ${last}`;
    const slug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '');
    let email = `${slug}${100 + index}@mail.com`;
    if (usedEmails.has(email)) email = `${slug}${100 + index}.x@mail.com`;
    usedEmails.add(email);
    const number = String(1000000 + Math.floor(random() * 8999999));
    guests.push({
      id: `gst_${index + 1}`,
      name,
      email,
      phone: `${dial} ${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`,
      nationality,
      idType: index % 3 === 0 ? 'passport' : index % 3 === 1 ? 'nationalId' : 'driverLicense',
      idNumber: `${['P', 'ID', 'DL'][index % 3]}${482001 + index * 137}`,
      notes:
        index % 17 === 0
          ? 'Prefers a lower bunk and a quiet corner.'
          : index % 23 === 0
            ? 'Allergic to feather pillows.'
            : '',
      createdAt: addDays(today, -Math.floor(random() * 900) - 20),
    });
  }

  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const reservations = [];
  const payments = [];
  let reservationIndex = 0;
  let paymentIndex = 0;

  const addPayment = (reservation, amount, date, type = 'payment') => {
    if (amount <= 0.5) return;
    paymentIndex += 1;
    payments.push({
      id: `pay_${paymentIndex}`,
      reservationId: reservation.id,
      guestId: reservation.guestId,
      guestName: reservation.guestName,
      reservationReference: reservation.reference,
      roomNumber: reservation.roomNumber,
      amount: Math.round(amount * 100) / 100,
      method: pickWeighted(random, METHODS),
      type,
      date,
      reference: type === 'refund' ? `RMB-${5400 + paymentIndex}` : `PMT-${(3200 + paymentIndex).toString().padStart(5, '0')}`,
      notes: '',
      createdAt: `${date}T10:24:00.000Z`,
    });
  };

  /* ------------------------------- reservations ------------------------------ */
  beds.forEach((bed) => {
    const room = roomMap.get(bed.roomId);
    let cursor = addDays(START, Math.floor(random() * 12));
    while (cursor < END) {
      const nights = weightedNights(random);
      const arrival = cursor;
      const departure = addDays(arrival, nights);
      if (departure > END) break;

      const guest = guests[Math.floor(random() * guests.length)];
      const isPast = departure <= today;
      const isCurrent = arrival <= today && departure > today;
      const isFuture = arrival > today;

      let status = 'confirmed';
      if (isPast) {
        const roll = random();
        status = roll < 0.055 ? (roll < 0.025 ? 'cancelled' : 'noShow') : 'checkedOut';
      } else if (isCurrent) {
        status = arrival === today ? 'confirmed' : 'checkedIn';
      } else {
        const roll = random();
        status = roll < 0.1 ? 'cancelled' : roll < 0.26 ? 'pending' : 'confirmed';
      }

      const rate = Math.max(18, room.pricePerBed + Math.round((random() - 0.5) * 6));
      const discount = random() < 0.16 ? Math.round(random() * 12) : 0;
      const total = Math.max(0, nights * rate - discount);
      const createdAt = addDays(arrival, -2 - Math.floor(random() * 24));

      reservationIndex += 1;
      const sequence = reservationIndex;
      const reservation = {
        id: `res_${sequence}`,
        reference: `STY-${(1042 + sequence * 37).toString(36).toUpperCase().padStart(5, '0')}`,
        guestId: guest.id,
        guestName: guest.name,
        roomId: room.id,
        roomNumber: room.number,
        bedId: bed.id,
        bedLabel: bed.label,
        arrival,
        departure,
        guests: room.bedCount === 1 ? Math.min(2, 1 + Math.floor(random() * 2)) : 1,
        rate,
        discount,
        total,
        paid: 0,
        source: pickWeighted(random, SOURCES),
        status,
        notes:
          random() < 0.08
            ? 'Requested a late check-in after 22:00.'
            : random() < 0.04
              ? 'Travelling with a bicycle — needs storage.'
              : '',
        createdAt: `${createdAt}T${String(8 + Math.floor(random() * 10)).padStart(2, '0')}:${String(
          Math.floor(random() * 59),
        ).padStart(2, '0')}:00.000Z`,
        createdBy: pick(random, ['Amina Bensalem', 'Léa Fontaine', 'Karim Haddad', 'Marc Dupont']),
      };

      // Ledger entries, then a matching denormalised paid total.
      const ledgerStart = payments.length;
      if (status === 'cancelled' || status === 'noShow') {
        if (random() < 0.4) {
          const deposit = Math.round(total * 0.3 * 100) / 100;
          addPayment(reservation, deposit, createdAt, 'payment');
          addPayment(reservation, deposit, addDays(createdAt, 1), 'refund');
        }
      } else {
        const roll = random();
        const payDate = isFuture ? createdAt : arrival;
        if (isPast) {
          if (roll < 0.88) addPayment(reservation, total, payDate);
          else if (roll < 0.96) {
            addPayment(reservation, Math.round(total * (0.4 + random() * 0.3) * 100) / 100, payDate);
          }
        } else if (isCurrent) {
          if (roll < 0.7) addPayment(reservation, total, payDate);
          else if (roll < 0.9) {
            addPayment(reservation, Math.round(total * (0.3 + random() * 0.4) * 100) / 100, payDate);
          }
        } else if (roll < 0.4) addPayment(reservation, total, payDate);
        else if (roll < 0.72) addPayment(reservation, Math.round(total * 0.3 * 100) / 100, payDate);
      }
      reservation.paid =
        Math.round(
          payments
            .slice(ledgerStart)
            .reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amount : payment.amount), 0) * 100,
        ) / 100;

      reservations.push(reservation);

      // Same-day turnovers happen, but beds usually rest a week between stays.
      cursor = addDays(departure, Math.floor(random() * 18));
    }
  });

  /* -------------------------------- expenses -------------------------------- */
  const expenses = [];
  let expenseIndex = 0;
  const nowDate = new Date();
  const baseAmount = {
    salaries: [4100, 5200], electricity: [280, 560], water: [110, 220], internet: [89, 129],
    cleaning: [180, 380], supplies: [140, 420], maintenance: [90, 320], marketing: [120, 380], other: [60, 180],
  };
  for (let monthOffset = 30; monthOffset >= 0; monthOffset -= 1) {
    const base = new Date(nowDate.getFullYear(), nowDate.getMonth() - monthOffset, 1);
    EXPENSE_CATEGORIES.forEach((category) => {
      const entries = category === 'supplies' || category === 'cleaning' ? 4 : 2;
      for (let entry = 0; entry < entries; entry += 1) {
        if (monthOffset === 0 && entry > 0) continue;
        const day = Math.min(
          2 + Math.floor(random() * 26),
          new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate(),
        );
        if (monthOffset === 0 && day > nowDate.getDate()) continue;
        const date = toISODate(new Date(base.getFullYear(), base.getMonth(), day));
        const [min, max] = baseAmount[category];
        expenseIndex += 1;
        expenses.push({
          id: `exp_${expenseIndex}`,
          category,
          vendor: VENDORS[category],
          date,
          amount: Math.round(min + random() * (max - min)),
          method: category === 'salaries' || category === 'electricity' || category === 'water' ? 'transfer' : pickWeighted(random, METHODS),
          receipt: `RC-${2400 + expenseIndex}`,
          notes: '',
          createdAt: `${date}T09:00:00.000Z`,
        });
      }
    });
  }

  /* ---------------------------------- tasks --------------------------------- */
  const housekeepers = ['stf_6', 'stf_7', 'stf_2'];
  const taskTitles = [
    ['cleaning', 'Full turnover after check-out'],
    ['cleaning', 'Deep clean shared bathroom'],
    ['maintenance', 'Fix leaking shower head'],
    ['linen', 'Replace worn mattress protectors'],
    ['inspection', 'Quarterly fire safety check'],
    ['cleaning', 'Lobby and stairwell refresh'],
    ['maintenance', 'Replace bed frame slats'],
    ['cleaning', 'Terrace furniture wipe-down'],
  ];
  const tasks = [];
  for (let index = 0; index < 900; index += 1) {
    const [type, title] = taskTitles[index % taskTitles.length];
    const room = rooms[Math.floor(random() * rooms.length)];
    const statusRoll = random();
    const dueOffset = Math.floor(random() * 26) - 8;
    tasks.push({
      id: `tsk_${index + 1}`,
      type,
      title,
      roomId: room.id,
      priority: pickWeighted(random, [['urgent', 0.08], ['high', 0.22], ['medium', 0.45], ['low', 0.25]]),
      status: statusRoll < 0.18 ? 'completed' : statusRoll < 0.38 ? 'inProgress' : 'open',
      assigneeId: random() < 0.8 ? pick(random, housekeepers) : null,
      due: addDays(today, dueOffset),
      description: type === 'cleaning' ? 'Strip beds, fresh linen, sanitise bathroom and restock amenities.' : '',
      createdAt: new Date(Date.now() - (index + 1) * 3600000).toISOString(),
    });
  }

  /* ------------------------------ notifications ----------------------------- */
  const recent = reservations.slice(-400);
  const notifications = [];
  const types = ['newBooking', 'payment', 'housekeeping', 'maintenance', 'checkout'];
  for (let index = 0; index < 300; index += 1) {
    const reservation = recent[Math.floor(random() * recent.length)];
    const type = types[index % types.length];
    notifications.push({
      id: `ntf_${index + 1}`,
      type,
      data: {
        guest: reservation.guestName,
        room: `Room ${reservation.roomNumber}`,
        amount: `€${Math.round(reservation.total)}`,
        nights: `${nightsBetween(reservation.arrival, reservation.departure)} nights`,
      },
      read: random() < 0.6,
      createdAt: new Date(Date.now() - index * 900000).toISOString(),
    });
  }

  const settings = {
    name: 'Maison Nomade',
    legalName: 'Maison Nomade SARL',
    email: 'hello@maisonnomade.com',
    phone: '+33 1 84 25 09 12',
    website: 'https://maisonnomade.com',
    address: '18 Rue des Archives',
    city: 'Paris',
    country: 'France',
    currency: 'EUR',
    timezone: 'Europe/Paris',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    taxRate: 10,
    cityTax: 1.5,
    deposit: 30,
    cancellationPolicy: 'free24',
    notifications: { newBooking: true, checkout: true, payment: true, housekeeping: true, digest: false },
  };

  return { rooms, beds, guests, reservations, payments, expenses, tasks, notifications, settings };
}

/** Replace the workspace with the large deterministic dataset. */
export async function seedLargeDatabase({ log = () => {} } = {}) {
  const data = buildLargeSeed();
  const passwordHash = await bcrypt.hash('stayora2026', 10);
  const now = Date.now();
  const staff = [
    { id: 'stf_1', name: 'Amina Bensalem', email: 'amina@stayora.app', role: 'owner', status: 'active', lastActive: new Date(now - 120000).toISOString(), invitedAt: new Date(now - 86400000 * 60).toISOString() },
    { id: 'stf_2', name: 'Marc Dupont', email: 'marc@maisonnomade.com', role: 'manager', status: 'active', lastActive: new Date(now - 2760000).toISOString(), invitedAt: new Date(now - 86400000 * 50).toISOString() },
    { id: 'stf_3', name: 'Léa Fontaine', email: 'lea@maisonnomade.com', role: 'receptionist', status: 'active', lastActive: new Date(now - 720000).toISOString(), invitedAt: new Date(now - 86400000 * 40).toISOString() },
    { id: 'stf_4', name: 'Karim Haddad', email: 'karim@maisonnomade.com', role: 'receptionist', status: 'active', lastActive: new Date(now - 15600000).toISOString(), invitedAt: new Date(now - 86400000 * 35).toISOString() },
    { id: 'stf_5', name: 'Sofia Marchetti', email: 'sofia@maisonnomade.com', role: 'accountant', status: 'active', lastActive: new Date(now - 86400000).toISOString(), invitedAt: new Date(now - 86400000 * 30).toISOString() },
    { id: 'stf_6', name: 'Nadia El Amrani', email: 'nadia@maisonnomade.com', role: 'housekeeping', status: 'active', lastActive: new Date(now - 5700000).toISOString(), invitedAt: new Date(now - 86400000 * 20).toISOString() },
    { id: 'stf_7', name: 'Diego Alvarez', email: 'diego@maisonnomade.com', role: 'housekeeping', status: 'invited', lastActive: null, invitedAt: new Date(now - 86400000 * 5).toISOString() },
  ].map((member) => ({ ...member, passwordHash }));

  log('Clearing collections…');
  await Promise.all(
    Object.entries(models)
      .filter(([name]) => !['Counter'].includes(name))
      .map(([, model]) => model.deleteMany({})),
  );
  await models.Counter.deleteMany({});

  log('Inserting rooms, beds and guests…');
  await Promise.all([insertInBatches(models.Room, data.rooms), insertInBatches(models.Bed, data.beds)]);
  await insertInBatches(models.Guest, data.guests);

  log(`Inserting ${data.reservations.length} reservations…`);
  await insertInBatches(models.Reservation, data.reservations);

  log(`Inserting ${data.payments.length} payments…`);
  await insertInBatches(models.Payment, data.payments);

  log('Inserting expenses, tasks, staff, notifications…');
  await Promise.all([
    insertInBatches(models.Expense, data.expenses, 500),
    insertInBatches(models.Task, data.tasks, 500),
    models.Staff.insertMany(staff),
    insertInBatches(models.Notification, data.notifications),
    models.Setting.create({ key: 'workspace', data: data.settings }),
  ]);

  log('Synchronising indexes and counters…');
  await Promise.all(
    Object.values(models).map((model) => model.syncIndexes().catch(() => null)),
  );
  const { syncCounters } = await import('../services/snapshot.js');
  await syncCounters();

  return {
    rooms: data.rooms.length,
    beds: data.beds.length,
    guests: data.guests.length,
    reservations: data.reservations.length,
    payments: data.payments.length,
    expenses: data.expenses.length,
    tasks: data.tasks.length,
    staff: staff.length,
    notifications: data.notifications.length,
    total:
      data.rooms.length + data.beds.length + data.guests.length + data.reservations.length +
      data.payments.length + data.expenses.length + data.tasks.length + staff.length + data.notifications.length,
  };
}
