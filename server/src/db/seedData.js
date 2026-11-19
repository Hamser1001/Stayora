import { addDays, nightsBetween, toISODate, todayISO } from '../lib/dates.js';

/* Deterministic PRNG so the demo workspace is stable between reloads. */
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

const GUEST_SEED = [
  ['Amara Okafor', 'Nigeria', 'amara.okafor@mail.com', '+33 6 12 45 88 21'],
  ['Lucas Meyer', 'Germany', 'lucas.meyer@mail.com', '+49 151 2245 8871'],
  ['Sofia Rossi', 'Italy', 'sofia.rossi@mail.com', '+39 340 552 8814'],
  ['Yuki Tanaka', 'Japan', 'yuki.tanaka@mail.com', '+81 90 2234 7781'],
  ['Emma Dubois', 'France', 'emma.dubois@mail.com', '+33 6 78 22 45 09'],
  ['Noah Williams', 'United States', 'noah.williams@mail.com', '+1 415 555 0127'],
  ['Priya Sharma', 'India', 'priya.sharma@mail.com', '+91 98200 44551'],
  ['Mateo García', 'Spain', 'mateo.garcia@mail.com', '+34 612 445 889'],
  ['Chloé Martin', 'France', 'chloe.martin@mail.com', '+33 6 45 88 12 03'],
  ["Liam O'Connor", 'Ireland', 'liam.oconnor@mail.com', '+353 87 224 9911'],
  ['Fatima Zahra', 'Morocco', 'fatima.zahra@mail.com', '+212 6 61 22 45 88'],
  ['Jonas Weber', 'Germany', 'jonas.weber@mail.com', '+49 176 445 2277'],
  ['Isabella Costa', 'Brazil', 'isabella.costa@mail.com', '+55 11 98822 4451'],
  ['Ethan Clarke', 'United Kingdom', 'ethan.clarke@mail.com', '+44 7700 900 221'],
  ['Mei Lin', 'China', 'mei.lin@mail.com', '+86 138 2244 7781'],
  ['Adam Novák', 'Czechia', 'adam.novak@mail.com', '+420 601 224 887'],
  ['Leila Haddad', 'Lebanon', 'leila.haddad@mail.com', '+961 3 224 881'],
  ['Tomás Silva', 'Portugal', 'tomas.silva@mail.com', '+351 912 445 881'],
  ['Hannah Berg', 'Sweden', 'hannah.berg@mail.com', '+46 70 224 88 11'],
  ['Daniel Kim', 'South Korea', 'daniel.kim@mail.com', '+82 10 2244 7781'],
  ['Nora Jensen', 'Denmark', 'nora.jensen@mail.com', '+45 22 45 88 11'],
  ['Rafael Mendes', 'Brazil', 'rafael.mendes@mail.com', '+55 21 98811 4422'],
  ['Zara Ahmed', 'Pakistan', 'zara.ahmed@mail.com', '+92 300 224 8871'],
  ['Oliver Smith', 'Australia', 'oliver.smith@mail.com', '+61 412 445 881'],
  ['Inès Laurent', 'Belgium', 'ines.laurent@mail.com', '+32 470 22 45 88'],
  ['Kai Müller', 'Austria', 'kai.mueller@mail.com', '+43 660 224 8871'],
];

const ROOM_SEED = [
  { number: '101', type: 'dorm', audience: 'mixed', floor: 0, beds: 6, price: 28, amenities: ['wifi', 'lockers', 'window'] },
  { number: '102', type: 'dorm', audience: 'mixed', floor: 0, beds: 4, price: 32, amenities: ['wifi', 'lockers', 'desk', 'window'] },
  { number: '103', type: 'private', audience: 'mixed', floor: 0, beds: 1, price: 78, amenities: ['wifi', 'privateBathroom', 'desk', 'airConditioning'] },
  { number: '104', type: 'family', audience: 'mixed', floor: 0, beds: 4, price: 34, amenities: ['wifi', 'privateBathroom', 'window'] },
  { number: '201', type: 'dorm', audience: 'female', floor: 1, beds: 6, price: 30, amenities: ['wifi', 'lockers', 'balcony'] },
  { number: '202', type: 'dorm', audience: 'mixed', floor: 1, beds: 8, price: 26, amenities: ['wifi', 'lockers', 'window'] },
  { number: '203', type: 'private', audience: 'mixed', floor: 1, beds: 1, price: 86, amenities: ['wifi', 'privateBathroom', 'desk', 'balcony'] },
  { number: '204', type: 'twin', audience: 'mixed', floor: 1, beds: 2, price: 42, amenities: ['wifi', 'desk', 'airConditioning'] },
  { number: '301', type: 'dorm', audience: 'mixed', floor: 2, beds: 4, price: 34, amenities: ['wifi', 'lockers', 'desk', 'airConditioning'] },
  { number: '302', type: 'suite', audience: 'mixed', floor: 2, beds: 1, price: 132, amenities: ['wifi', 'privateBathroom', 'airConditioning', 'balcony', 'desk'] },
  { number: '303', type: 'twin', audience: 'female', floor: 2, beds: 2, price: 45, amenities: ['wifi', 'window', 'desk'] },
  { number: '304', type: 'family', audience: 'mixed', floor: 2, beds: 5, price: 36, amenities: ['wifi', 'privateBathroom', 'accessible'] },
  { number: '401', type: 'dorm', audience: 'mixed', floor: 3, beds: 6, price: 29, amenities: ['wifi', 'lockers', 'window', 'desk'] },
];

const STAFF_SEED = [
  { name: 'Amina Bensalem', email: 'hamza@stayora.app', role: 'owner', status: 'active', lastActiveMinutes: 2 },
  { name: 'Marc Dupont', email: 'marc@maisonnomade.com', role: 'manager', status: 'active', lastActiveMinutes: 46 },
  { name: 'Léa Fontaine', email: 'lea@maisonnomade.com', role: 'receptionist', status: 'active', lastActiveMinutes: 12 },
  { name: 'Karim Haddad', email: 'karim@maisonnomade.com', role: 'receptionist', status: 'active', lastActiveMinutes: 260 },
  { name: 'Sofia Marchetti', email: 'sofia@maisonnomade.com', role: 'accountant', status: 'active', lastActiveMinutes: 1440 },
  { name: 'Nadia El Amrani', email: 'nadia@maisonnomade.com', role: 'housekeeping', status: 'active', lastActiveMinutes: 95 },
  { name: 'Diego Alvarez', email: 'diego@maisonnomade.com', role: 'housekeeping', status: 'invited', lastActiveMinutes: null },
];

const SOURCES = ['direct', 'walkIn', 'website', 'phone', 'bookingCom', 'hostelworld', 'airbnb', 'agent'];
const SOURCE_WEIGHTS = [0.2, 0.08, 0.19, 0.05, 0.24, 0.12, 0.08, 0.04];
const METHODS = ['cash', 'card', 'transfer', 'online'];
const METHOD_WEIGHTS = [0.18, 0.47, 0.2, 0.15];

function pickWeighted(random, values, weights) {
  const roll = random();
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += weights[i];
    if (roll <= sum) return values[i];
  }
  return values[values.length - 1];
}

function reference(index) {
  return `STY-${(1042 + index * 37).toString(36).toUpperCase().padStart(5, '0')}`;
}

export function buildSeedDatabase() {
  const random = mulberry32(20261106);
  const today = todayISO();
  const now = Date.now();

  const guests = GUEST_SEED.map(([name, nationality, email, phone], index) => ({
    id: `gst_${index + 1}`,
    name,
    email,
    phone,
    nationality,
    idType: index % 3 === 0 ? 'passport' : index % 3 === 1 ? 'nationalId' : 'driverLicense',
    idNumber: `${['P', 'ID', 'DL'][index % 3]}${(482001 + index * 137).toString()}`,
    notes:
      index % 7 === 0
        ? 'Prefers a lower bunk and a quiet corner.'
        : index % 9 === 0
          ? 'Allergic to feather pillows.'
          : '',
    createdAt: addDays(today, -Math.floor(random() * 520) - 20),
  }));

  const rooms = [];
  const beds = [];
  ROOM_SEED.forEach((room, roomIndex) => {
    const roomId = `rom_${roomIndex + 1}`;
    rooms.push({
      id: roomId,
      number: room.number,
      type: room.type,
      audience: room.audience,
      floor: room.floor,
      bedCount: room.beds,
      pricePerBed: room.price,
      amenities: room.amenities,
      notes: room.type === 'suite' ? 'Corner suite with skyline view.' : '',
      createdAt: addDays(today, -640 + roomIndex),
    });
    for (let bedIndex = 0; bedIndex < room.beds; bedIndex += 1) {
      beds.push({
        id: `bed_${room.number}_${bedIndex + 1}`,
        roomId,
        number: bedIndex + 1,
        label: `${room.number}-${String.fromCharCode(65 + bedIndex)}`,
        cleaning: false,
        maintenance: false,
        outOfService: false,
        note: '',
      });
    }
  });

  // Physical housekeeping state for a handful of beds.
  const maintenanceBed = beds.find((b) => b.id === 'bed_204_2');
  if (maintenanceBed) {
    maintenanceBed.maintenance = true;
    maintenanceBed.note = 'Shower head leaking — plumber booked.';
  }
  const outOfServiceBed = beds.find((b) => b.id === 'bed_401_6');
  if (outOfServiceBed) {
    outOfServiceBed.outOfService = true;
    outOfServiceBed.note = 'Frame damaged, replacement ordered.';
  }
  ['bed_101_3', 'bed_202_5', 'bed_303_1'].forEach((id) => {
    const bed = beds.find((b) => b.id === id);
    if (bed) bed.cleaning = true;
  });

  const reservations = [];
  const payments = [];
  let resIndex = 0;
  let paymentIndex = 0;

  const pushPayment = (reservation, amount, date, suffix = 0) => {
    if (amount <= 0.5) return;
    const paid = Math.round(amount * 100) / 100;
    paymentIndex += 1;
    payments.push({
      id: `pay_${paymentIndex}`,
      reservationId: reservation.id,
      guestId: reservation.guestId,
      amount: paid,
      method: pickWeighted(random, METHODS, METHOD_WEIGHTS),
      type: 'payment',
      date,
      reference: `PMT-${(paymentIndex + 3200).toString().padStart(5, '0')}${suffix ? `-${suffix}` : ''}`,
      createdAt: `${date}T10:24:00.000Z`,
    });
    // `paid` is the ledger's running total; a payment without it left every
    // seeded reservation looking unpaid.
    reservation.paid = Math.round(((reservation.paid || 0) + paid) * 100) / 100;
  };

  beds.forEach((bed) => {
    let cursor = addDays(today, -68 - Math.floor(random() * 8));
    // Some beds stay free at the start of the window for natural availability.
    if (random() < 0.12) cursor = addDays(cursor, 9 + Math.floor(random() * 10));

    while (cursor < addDays(today, 38)) {
      const stayLength = 1 + Math.floor(random() * 5);
      const arrival = cursor;
      const departure = addDays(arrival, stayLength);
      const guest = guests[Math.floor(random() * guests.length)];
      const source = pickWeighted(random, SOURCES, SOURCE_WEIGHTS);
      const isPast = departure <= today;
      const isCurrent = arrival <= today && departure > today;
      const isFuture = arrival > today;

      let status = 'confirmed';
      if (isPast) status = random() < 0.055 ? (random() < 0.45 ? 'cancelled' : 'noShow') : 'checkedOut';
      else if (isCurrent) status = arrival === today ? 'confirmed' : 'checkedIn';
      else if (isFuture) {
        const roll = random();
        status = roll < 0.12 ? 'cancelled' : roll < 0.34 ? 'pending' : 'confirmed';
      }

      const room = rooms.find((r) => r.id === bed.roomId);
      const nights = nightsBetween(arrival, departure);
      const discount = random() < 0.16 ? Math.round(random() * 12) : 0;
      const total = nights * room.pricePerBed - discount;
      const createdAt = addDays(arrival, -2 - Math.floor(random() * 24));
      const reservation = {
        id: `res_${++resIndex}`,
        reference: reference(resIndex),
        guestId: guest.id,
        roomId: room.id,
        bedId: bed.id,
        guestName: guest.name,
        roomNumber: room.number,
        bedLabel: bed.label,
        arrival,
        departure,
        guests: room.bedCount === 1 ? Math.min(2, 1 + Math.floor(random() * 2)) : 1,
        rate: room.pricePerBed,
        discount,
        total,
        paid: 0,
        source,
        status,
        notes:
          random() < 0.1
            ? 'Requested a late check-in after 22:00.'
            : random() < 0.05
              ? 'Travelling with a bicycle — needs storage.'
              : '',
        createdAt: `${createdAt}T${String(8 + Math.floor(random() * 10)).padStart(2, '0')}:${String(
          Math.floor(random() * 59),
        ).padStart(2, '0')}:00.000Z`,
        createdBy: 'Amina Bensalem',
      };

      if (status !== 'cancelled' && status !== 'noShow') {
        const paidRatio = isPast
          ? random() < 0.9
            ? 1
            : 0.45 + random() * 0.3
          : isCurrent
            ? random() < 0.62
              ? 1
              : random() < 0.55
                ? 0.2 + random() * 0.4
                : 0
            : random() < 0.42
              ? 1
              : random() < 0.5
                ? 0.3
                : 0;
        if (paidRatio > 0) {
          if (paidRatio >= 1) {
            pushPayment(reservation, total, isFuture ? createdAt : arrival);
          } else {
            const first = Math.round(total * paidRatio);
            pushPayment(reservation, first, isFuture ? createdAt : arrival);
            if (paidRatio > 0.55 && isPast) {
              pushPayment(reservation, total - first, addDays(arrival, 1), 2);
            }
          }
        }
      }
      reservations.push(reservation);

      cursor = addDays(departure, 1 + Math.floor(random() * 5));
    }
  });

  // Guarantee a lively front desk today.
  const todaysArrivals = reservations.filter((r) => r.arrival === today && r.status === 'confirmed');
  const todaysDepartures = reservations.filter((r) => r.departure === today && r.status === 'checkedIn');
  if (todaysArrivals.length < 3) {
    const freeBeds = beds.filter(
      (bed) =>
        !bed.maintenance &&
        !bed.outOfService &&
        !reservations.some(
          (r) =>
            r.bedId === bed.id &&
            !['cancelled', 'noShow', 'checkedOut'].includes(r.status) &&
            r.arrival <= today &&
            r.departure > today,
        ),
    );
    freeBeds.slice(0, 3 - todaysArrivals.length).forEach((bed, index) => {
      const guest = guests[(index + 3) % guests.length];
      const room = rooms.find((r) => r.id === bed.roomId);
      resIndex += 1;
      reservations.push({
        id: `res_${resIndex}`,
        reference: reference(resIndex),
        guestId: guest.id,
        roomId: room.id,
        bedId: bed.id,
        guestName: guest.name,
        roomNumber: room.number,
        bedLabel: bed.label,
        arrival: today,
        departure: addDays(today, 2 + index),
        guests: 1,
        rate: room.pricePerBed,
        discount: 0,
        total: room.pricePerBed * (2 + index),
        paid: 0,
        source: 'direct',
        status: 'confirmed',
        notes: index === 0 ? 'Arriving around 18:30.' : '',
        createdAt: new Date(now - 86400000 * (2 + index)).toISOString(),
        createdBy: 'Léa Fontaine',
      });
    });
  }

  // Record a refund on one cancelled booking to show ledger variety.
  const refundable = payments.find((p) => {
    const res = reservations.find((r) => r.id === p.reservationId);
    return res && res.status === 'cancelled';
  });
  if (refundable) {
    paymentIndex += 1;
    payments.push({
      id: `pay_${paymentIndex}`,
      reservationId: refundable.reservationId,
      guestId: refundable.guestId,
      amount: refundable.amount,
      method: refundable.method,
      type: 'refund',
      date: addDays(today, -3),
      reference: `RMB-${(5400 + paymentIndex).toString()}`,
      createdAt: `${addDays(today, -3)}T16:10:00.000Z`,
    });
    // A refund is money that left the ledger, so the running total drops with it.
    const refunded = reservations.find((entry) => entry.id === refundable.reservationId);
    if (refunded) {
      refunded.paid = Math.max(
        0,
        Math.round(((refunded.paid || 0) - refundable.amount) * 100) / 100,
      );
    }
  }

  const EXPENSE_TEMPLATE = [
    { category: 'salaries', vendor: 'Team payroll', amount: [4100, 4600], day: 27, method: 'transfer' },
    { category: 'electricity', vendor: 'City Power & Light', amount: [320, 520], day: 12, method: 'transfer' },
    { category: 'electricity', vendor: 'City Power & Light', amount: [280, 460], day: 26, method: 'transfer' },
    { category: 'water', vendor: 'Aqua Municipal', amount: [110, 190], day: 9, method: 'transfer' },
    { category: 'internet', vendor: 'Fiberline Business', amount: [89, 89], day: 4, method: 'card' },
    { category: 'cleaning', vendor: 'Fresh Linen Co.', amount: [180, 320], day: 16, method: 'card' },
    { category: 'supplies', vendor: 'Hostel Supply Hub', amount: [140, 380], day: 20, method: 'card' },
    { category: 'maintenance', vendor: 'Atelier Réparations', amount: [90, 260], day: 22, method: 'cash' },
    { category: 'marketing', vendor: 'Meta Ads', amount: [120, 220], day: 7, method: 'card' },
    { category: 'other', vendor: 'Guest welcome baskets', amount: [60, 140], day: 18, method: 'cash' },
  ];

  const expenses = [];
  let expenseIndex = 0;
  const nowDate = new Date();
  for (let monthOffset = 0; monthOffset < 4; monthOffset += 1) {
    EXPENSE_TEMPLATE.forEach((template) => {
      if (monthOffset === 0 && template.day > nowDate.getDate()) return;
      const base = new Date(nowDate.getFullYear(), nowDate.getMonth() - monthOffset, 1);
      const day = Math.min(template.day, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate());
      const date = toISODate(new Date(base.getFullYear(), base.getMonth(), day));
      expenseIndex += 1;
      expenses.push({
        id: `exp_${expenseIndex}`,
        category: template.category,
        vendor: template.vendor,
        date,
        amount: Math.round(template.amount[0] + random() * (template.amount[1] - template.amount[0])),
        method: template.method,
        receipt: `RC-${2400 + expenseIndex}`,
        notes: '',
        createdAt: `${date}T09:00:00.000Z`,
      });
    });
  }

  const housekeepers = STAFF_SEED.filter((s) => s.role === 'housekeeping' || s.role === 'manager');
  // Seeded tasks get a real position per status so the board order is persisted
  // from the first render instead of relying on the priority/due fallback.
  const nextTaskPosition = new Map();
  const tasks = [
    {
      type: 'cleaning',
      title: 'Full turnover after check-out',
      roomId: 'rom_5',
      priority: 'high',
      status: 'open',
      assigneeId: 'stf_6',
      due: today,
      description: 'Strip beds, fresh linen, sanitise bathroom and restock amenities.',
    },
    {
      type: 'cleaning',
      title: 'Deep clean shared bathroom',
      roomId: 'rom_6',
      priority: 'medium',
      status: 'inProgress',
      assigneeId: 'stf_6',
      due: today,
      description: 'Descale showers and refill soap dispensers.',
    },
    {
      type: 'maintenance',
      title: 'Fix leaking shower head',
      roomId: 'rom_8',
      priority: 'urgent',
      status: 'inProgress',
      assigneeId: 'stf_2',
      due: today,
      description: 'Plumber booked for 14:00. Bed 204-B out of service until fixed.',
    },
    {
      type: 'linen',
      title: 'Replace worn mattress protectors',
      roomId: 'rom_13',
      priority: 'low',
      status: 'open',
      assigneeId: null,
      due: addDays(today, 2),
      description: 'Six protectors ordered, replace on next turnover.',
    },
    {
      type: 'inspection',
      title: 'Quarterly fire safety check',
      roomId: 'rom_12',
      priority: 'medium',
      status: 'open',
      assigneeId: 'stf_2',
      due: addDays(today, 3),
      description: 'Check extinguishers, alarms and emergency lighting.',
    },
    {
      type: 'cleaning',
      title: 'Lobby and stairwell refresh',
      roomId: 'rom_1',
      priority: 'low',
      status: 'completed',
      assigneeId: 'stf_6',
      due: addDays(today, -1),
      description: 'Morning clean before 09:00.',
    },
    {
      type: 'maintenance',
      title: 'Replace bed frame slats',
      roomId: 'rom_13',
      priority: 'high',
      status: 'open',
      assigneeId: null,
      due: addDays(today, 1),
      description: 'Bed 401-F taken out of service.',
    },
    {
      type: 'cleaning',
      title: 'Terrace furniture wipe-down',
      roomId: 'rom_5',
      priority: 'low',
      status: 'completed',
      assigneeId: 'stf_6',
      due: addDays(today, -2),
      description: '',
    },
  ].map((task, index) => {
    const position = nextTaskPosition.get(task.status) || 0;
    nextTaskPosition.set(task.status, position + 1);
    return {
      id: `tsk_${index + 1}`,
      ...task,
      position,
      roomId: task.roomId,
      createdAt: new Date(now - (index + 1) * 5400000).toISOString(),
    };
  });

  void housekeepers;

  const staff = STAFF_SEED.map((member, index) => ({
    id: `stf_${index + 1}`,
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.status,
    lastActive: member.lastActiveMinutes
      ? new Date(now - member.lastActiveMinutes * 60000).toISOString()
      : null,
    invitedAt: new Date(now - 86400000 * (index + 3)).toISOString(),
  }));

  const notifications = [
    {
      id: 'ntf_1',
      type: 'newBooking',
      data: { guest: 'Emma Dubois', room: 'Room 201', nights: '3 nights' },
      read: false,
      createdAt: new Date(now - 12 * 60000).toISOString(),
    },
    {
      id: 'ntf_2',
      type: 'payment',
      data: { guest: 'Lucas Meyer', amount: '€156' },
      read: false,
      createdAt: new Date(now - 64 * 60000).toISOString(),
    },
    {
      id: 'ntf_3',
      type: 'housekeeping',
      data: { room: 'Room 303' },
      read: false,
      createdAt: new Date(now - 6 * 3600000).toISOString(),
    },
    {
      id: 'ntf_4',
      type: 'maintenance',
      data: { room: 'Room 204', issue: 'Leaking shower head' },
      read: true,
      createdAt: new Date(now - 26 * 3600000).toISOString(),
    },
    {
      id: 'ntf_5',
      type: 'checkout',
      data: { guest: 'Yuki Tanaka', room: 'Room 302' },
      read: true,
      createdAt: new Date(now - 2 * 86400000).toISOString(),
    },
  ];

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
    baseCurrency: 'EUR',
    timezone: 'Europe/Paris',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    taxRate: 10,
    cityTax: 1.5,
    deposit: 30,
    cancellationPolicy: 'free24',
    notifications: {
      newBooking: true,
      checkout: true,
      payment: true,
      housekeeping: true,
      digest: false,
    },
  };

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    settings,
    rooms,
    beds,
    guests,
    reservations,
    payments,
    expenses,
    tasks,
    staff,
    notifications,
    session: null,
  };
}
