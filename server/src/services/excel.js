import XLSX from 'xlsx';
import { models } from '../db/models.js';
import { nextIdFor, reservationReference } from './snapshot.js';
import { todayISO } from '../lib/dates.js';
import { fail } from '../middleware/error.js';
import { logActivity } from './activity.js';

/* ------------------------------- Definitions ------------------------------ */

export const ENUMS = {
  roomType: ['dorm', 'private', 'twin', 'family', 'suite'],
  audience: ['mixed', 'female', 'male'],
  guestIdType: ['passport', 'nationalId', 'drivingLicense', 'other'],
  source: ['direct', 'walkIn', 'website', 'phone', 'bookingCom', 'hostelworld', 'airbnb', 'agent'],
  reservationStatus: ['pending', 'confirmed', 'checkedIn', 'checkedOut', 'cancelled', 'noShow'],
  paymentMethod: ['cash', 'card', 'transfer', 'online', 'other'],
  paymentType: ['payment', 'refund'],
  expenseCategory: [
    'electricity', 'water', 'internet', 'cleaning', 'maintenance',
    'salaries', 'supplies', 'marketing', 'other',
  ],
  taskType: ['cleaning', 'maintenance', 'inspection', 'linen'],
  taskPriority: ['low', 'medium', 'high', 'urgent'],
  taskStatus: ['open', 'inProgress', 'completed'],
};

const column = (key, header, extra = {}) => ({ key, header, ...extra });

export const COLLECTIONS = {
  rooms: {
    module: 'rooms',
    label: 'Rooms',
    description: 'Rooms and their beds. Importing a room creates its beds automatically.',
    keyFields: ['number'],
    columns: [
      column('number', 'Room number', { required: true, type: 'string' }),
      column('type', 'Room type', { required: true, type: 'enum', values: ENUMS.roomType }),
      column('audience', 'Audience', { type: 'enum', values: ENUMS.audience, default: 'mixed' }),
      column('floor', 'Floor', { type: 'number', default: 0 }),
      column('bedCount', 'Beds', { required: true, type: 'number', min: 1, max: 60 }),
      column('pricePerBed', 'Price per bed', { required: true, type: 'number', min: 0 }),
      column('amenities', 'Amenities', { type: 'list' }),
      column('notes', 'Notes', { type: 'string' }),
    ],
  },
  guests: {
    module: 'guests',
    label: 'Guests',
    description: 'Guest profiles. Email is used to detect duplicates when present.',
    keyFields: ['email'],
    columns: [
      column('name', 'Full name', { required: true, type: 'string' }),
      column('email', 'Email', { type: 'email' }),
      column('phone', 'Phone', { type: 'string' }),
      column('nationality', 'Nationality', { type: 'string' }),
      column('idType', 'ID type', { type: 'enum', values: ENUMS.guestIdType, default: 'passport' }),
      column('idNumber', 'ID number', { type: 'string' }),
      column('notes', 'Notes', { type: 'string' }),
    ],
  },
  reservations: {
    module: 'reservations',
    label: 'Reservations',
    description: 'Bookings linked to an existing guest and room. Bed is optional when the room has free beds.',
    keyFields: ['reference'],
    columns: [
      column('reference', 'Reference', { type: 'string' }),
      column('guestEmail', 'Guest email', { type: 'email' }),
      column('guestName', 'Guest name', { type: 'string' }),
      column('roomNumber', 'Room number', { required: true, type: 'string' }),
      column('bedLabel', 'Bed label', { type: 'string' }),
      column('arrival', 'Arrival', { required: true, type: 'date' }),
      column('departure', 'Departure', { required: true, type: 'date' }),
      column('guests', 'Guests', { type: 'number', min: 1, default: 1 }),
      column('rate', 'Rate per night', { required: true, type: 'number', min: 0 }),
      column('discount', 'Discount', { type: 'number', min: 0, default: 0 }),
      column('source', 'Source', { type: 'enum', values: ENUMS.source, default: 'direct' }),
      column('status', 'Status', { type: 'enum', values: ENUMS.reservationStatus, default: 'confirmed' }),
      column('notes', 'Notes', { type: 'string' }),
    ],
  },
  payments: {
    module: 'payments',
    label: 'Payments',
    description: 'Payments linked to a reservation reference. Guest and room are derived from it.',
    keyFields: ['reference'],
    columns: [
      column('reservationReference', 'Reservation reference', { required: true, type: 'string' }),
      column('amount', 'Amount', { required: true, type: 'number', min: 0 }),
      column('method', 'Method', { type: 'enum', values: ENUMS.paymentMethod, default: 'card' }),
      column('type', 'Type', { type: 'enum', values: ENUMS.paymentType, default: 'payment' }),
      column('date', 'Date', { required: true, type: 'date' }),
      column('reference', 'Payment reference', { type: 'string' }),
      column('notes', 'Notes', { type: 'string' }),
    ],
  },
  expenses: {
    module: 'expenses',
    label: 'Expenses',
    description: 'Operating expenses. Duplicates are matched on category, vendor, date and amount.',
    keyFields: ['category', 'vendor', 'date', 'amount'],
    columns: [
      column('category', 'Category', { required: true, type: 'enum', values: ENUMS.expenseCategory }),
      column('vendor', 'Vendor', { required: true, type: 'string' }),
      column('date', 'Date', { required: true, type: 'date' }),
      column('amount', 'Amount', { required: true, type: 'number', min: 0 }),
      column('method', 'Method', { type: 'enum', values: ENUMS.paymentMethod, default: 'card' }),
      column('receipt', 'Receipt', { type: 'string' }),
      column('notes', 'Notes', { type: 'string' }),
    ],
  },
  tasks: {
    module: 'housekeeping',
    label: 'Housekeeping tasks',
    description: 'Cleaning and maintenance tasks linked to a room number.',
    keyFields: ['title', 'roomNumber', 'due'],
    columns: [
      column('title', 'Title', { required: true, type: 'string' }),
      column('roomNumber', 'Room number', { required: true, type: 'string' }),
      column('type', 'Task type', { type: 'enum', values: ENUMS.taskType, default: 'cleaning' }),
      column('priority', 'Priority', { type: 'enum', values: ENUMS.taskPriority, default: 'medium' }),
      column('status', 'Status', { type: 'enum', values: ENUMS.taskStatus, default: 'open' }),
      column('due', 'Due date', { required: true, type: 'date' }),
      column('description', 'Description', { type: 'string' }),
    ],
  },
};

export const COLLECTION_KEYS = Object.keys(COLLECTIONS);
const MAX_ROWS = 2000;

/* --------------------------------- Helpers -------------------------------- */

const norm = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseNumber(value, def) {
  const text = toText(value).replace(/\s/g, '').replace(',', '.');
  if (text === '') return def.default ?? null;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`“${toText(value)}” is not a number.`);
  if (def.min !== undefined && number < def.min) throw new Error(`Must be ${def.min} or more.`);
  if (def.max !== undefined && number > def.max) throw new Error(`Must be ${def.max} or less.`);
  return number;
}

function parseDate(value, def) {
  const raw = value;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const text = toText(raw);
  if (!text) return def.default ?? null;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const iso = text.slice(0, 10);
    const date = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso) return iso;
  }
  // dd/mm/yyyy and mm/dd/yyyy are both common in spreadsheets.
  const match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (match) {
    const [, first, second, year] = match;
    const dayFirst = Number(first) > 12 || Number(second) <= 12;
    const day = dayFirst ? Number(first) : Number(second);
    const month = dayFirst ? Number(second) : Number(first);
    const date = new Date(Date.UTC(Number(year), month - 1, day));
    if (date.getUTCDate() === day && date.getUTCMonth() === month - 1) {
      return date.toISOString().slice(0, 10);
    }
  }
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Excel serial date.
    const date = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return date.toISOString().slice(0, 10);
  }
  throw new Error(`“${text}” is not a valid date (use YYYY-MM-DD).`);
}

function parseEnum(value, def) {
  const text = toText(value);
  if (!text) return def.default ?? null;
  const match = def.values.find((entry) => norm(entry) === norm(text));
  if (!match) throw new Error(`Unknown value “${text}”. Allowed: ${def.values.join(', ')}.`);
  return match;
}

function parseCell(value, def) {
  switch (def.type) {
    case 'number':
      return parseNumber(value, def);
    case 'date':
      return parseDate(value, def);
    case 'enum':
      return parseEnum(value, def);
    case 'email': {
      const text = toText(value).toLowerCase();
      if (text && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
        throw new Error(`“${text}” is not a valid email address.`);
      }
      return text || def.default || '';
    }
    case 'list':
      return toText(value)
        .split(/[,;|]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    default:
      return toText(value) || def.default || '';
  }
}

/** Reads a sheet matrix (first row = headers) into canonical records. */
export function mapSheet(matrix, def) {
  if (!Array.isArray(matrix) || matrix.length === 0) return { missing: def.columns.filter((c) => c.required).map((c) => c.header), records: [] };

  const lookup = new Map();
  def.columns.forEach((definition) => {
    lookup.set(norm(definition.header), definition);
    lookup.set(norm(definition.key), definition);
  });

  const headerRow = matrix[0];
  const mapped = headerRow.map((header) => lookup.get(norm(header)) || null);
  const missing = def.columns
    .filter((definition) => definition.required && !mapped.some((entry) => entry?.key === definition.key))
    .map((definition) => definition.header);

  const records = [];
  matrix.slice(1).forEach((cells, index) => {
    if (!Array.isArray(cells) || cells.every((cell) => toText(cell) === '')) return;
    const record = {};
    mapped.forEach((definition, columnIndex) => {
      if (definition) record[definition.key] = cells[columnIndex] ?? '';
    });
    records.push({ row: index + 2, record });
  });

  return { missing, records };
}

function duplicateKey(collectionKey, row) {
  switch (collectionKey) {
    case 'rooms':
      return norm(row.number);
    case 'guests':
      return row.email ? `email:${norm(row.email)}` : `name:${norm(row.name)}|${norm(row.phone)}`;
    case 'reservations':
      return row.reference ? norm(row.reference) : '';
    case 'payments':
      return row.reference ? norm(row.reference) : '';
    case 'expenses':
      return [row.category, norm(row.vendor), row.date, Number(row.amount).toFixed(2)].join('|');
    case 'tasks':
      return [norm(row.title), norm(row.roomNumber), row.due].join('|');
    default:
      return '';
  }
}

function nightsBetween(arrival, departure) {
  return Math.round((Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`)) / 86400000);
}

/* --------------------------------- Export --------------------------------- */

const EXPORT_LIMIT = 20000;

async function exportRows(keys) {
  const want = new Set(keys);
  const rows = {};

  if (want.has('rooms')) {
    const rooms = await models.Room.find().sort({ number: 1 }).limit(EXPORT_LIMIT).lean();
    rows.rooms = rooms.map((room) => ({
      number: room.number,
      type: room.type,
      audience: room.audience,
      floor: room.floor,
      bedCount: room.bedCount,
      pricePerBed: room.pricePerBed,
      amenities: (room.amenities || []).join(', '),
      notes: room.notes || '',
    }));
  }

  if (want.has('guests')) {
    const guests = await models.Guest.find().sort({ name: 1 }).limit(EXPORT_LIMIT).lean();
    rows.guests = guests.map((guest) => ({
      name: guest.name,
      email: guest.email || '',
      phone: guest.phone || '',
      nationality: guest.nationality || '',
      idType: guest.idType || 'passport',
      idNumber: guest.idNumber || '',
      notes: guest.notes || '',
    }));
  }

  if (want.has('reservations')) {
    const [reservations, guests] = await Promise.all([
      models.Reservation.find().sort({ arrival: -1 }).limit(EXPORT_LIMIT).lean(),
      models.Guest.find({}, { id: 1, email: 1, _id: 0 }).lean(),
    ]);
    const emailById = new Map(guests.map((guest) => [guest.id, guest.email]));
    rows.reservations = reservations.map((reservation) => ({
      reference: reservation.reference,
      guestEmail: emailById.get(reservation.guestId) || '',
      guestName: reservation.guestName || '',
      roomNumber: reservation.roomNumber || '',
      bedLabel: reservation.bedLabel || '',
      arrival: reservation.arrival,
      departure: reservation.departure,
      guests: reservation.guests,
      rate: reservation.rate,
      discount: reservation.discount,
      source: reservation.source,
      status: reservation.status,
      notes: reservation.notes || '',
    }));
  }

  if (want.has('payments')) {
    const payments = await models.Payment.find().sort({ date: -1 }).limit(EXPORT_LIMIT).lean();
    rows.payments = payments.map((payment) => ({
      reservationReference: payment.reservationReference || '',
      amount: payment.amount,
      method: payment.method,
      type: payment.type || 'payment',
      date: payment.date,
      reference: payment.reference,
      notes: payment.notes || '',
    }));
  }

  if (want.has('expenses')) {
    const expenses = await models.Expense.find().sort({ date: -1 }).limit(EXPORT_LIMIT).lean();
    rows.expenses = expenses.map((expense) => ({
      category: expense.category,
      vendor: expense.vendor,
      date: expense.date,
      amount: expense.amount,
      method: expense.method,
      receipt: expense.receipt || '',
      notes: expense.notes || '',
    }));
  }

  if (want.has('tasks')) {
    const [tasks, rooms] = await Promise.all([
      models.Task.find().sort({ due: 1 }).limit(EXPORT_LIMIT).lean(),
      models.Room.find({}, { id: 1, number: 1, _id: 0 }).lean(),
    ]);
    const roomNumber = new Map(rooms.map((room) => [room.id, room.number]));
    rows.tasks = tasks.map((task) => ({
      title: task.title,
      roomNumber: roomNumber.get(task.roomId) || '',
      type: task.type,
      priority: task.priority,
      status: task.status,
      due: task.due,
      description: task.description || '',
    }));
  }

  return rows;
}

export async function buildWorkbook(keys) {
  const rows = await exportRows(keys);
  const workbook = XLSX.utils.book_new();

  Object.keys(COLLECTIONS).forEach((key) => {
    if (!keys.includes(key)) return;
    const def = COLLECTIONS[key];
    const data = rows[key] || [];
    const sheet = XLSX.utils.json_to_sheet(data, {
      header: def.columns.map((entry) => entry.key),
      skipHeader: true,
    });
    const header = def.columns.map((entry) => entry.header);
    XLSX.utils.sheet_add_aoa(sheet, [header], { origin: 'A1' });
    sheet['!cols'] = def.columns.map((entry) => ({ wch: Math.max(14, Math.min(34, entry.header.length + 6)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, def.label.slice(0, 31));
  });

  const info = workbook.SheetNames.map((name, index) => ({
    name,
    rows: rows[keys.filter((key) => COLLECTIONS[key].label.slice(0, 31) === name)[0]]?.length || 0,
  }));
  const readme = XLSX.utils.aoa_to_sheet([
    ['Stayora export'],
    ['Generated', new Date().toISOString()],
    [],
    ['Sheet', 'Rows'],
    ...info.map((entry) => [entry.name, entry.rows]),
  ]);
  XLSX.utils.book_append_sheet(workbook, readme, 'Export info');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function buildTemplate(collectionKey) {
  const def = COLLECTIONS[collectionKey];
  if (!def) fail('Unknown collection.', 'UNKNOWN_COLLECTION', 404);
  const workbook = XLSX.utils.book_new();
  const header = def.columns.map((entry) => entry.header);
  const example = def.columns.map((entry) => {
    if (entry.key === 'arrival' || entry.key === 'due') return todayISO();
    if (entry.key === 'departure') {
      const date = new Date();
      date.setDate(date.getDate() + 2);
      return date.toISOString().slice(0, 10);
    }
    if (entry.type === 'number') return entry.min ?? 1;
    if (entry.type === 'enum') return entry.values[0];
    if (entry.type === 'email') return 'guest@example.com';
    return entry.default ?? '';
  });
  const sheet = XLSX.utils.aoa_to_sheet([header, def.required ? example : []]);
  sheet['!cols'] = def.columns.map((entry) => ({ wch: Math.max(14, Math.min(34, entry.header.length + 6)) }));
  XLSX.utils.book_append_sheet(workbook, sheet, def.label.slice(0, 31));
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/* --------------------------------- Import --------------------------------- */

class RowError extends Error {
  constructor(column, message, code = 'INVALID_VALUE') {
    super(message);
    this.column = column;
    this.code = code;
  }
}

function required(record, def) {
  const missing = def.columns
    .filter((entry) => entry.required && toText(record[entry.key]) === '')
    .map((entry) => entry.header);
  if (missing.length) throw new RowError(missing[0], `Required column${missing.length > 1 ? 's' : ''} missing: ${missing.join(', ')}.`, 'REQUIRED');
}

export async function importCollection({ collectionKey, matrix, dryRun = true, actor }) {
  const def = COLLECTIONS[collectionKey];
  if (!def) fail('Unknown collection.', 'UNKNOWN_COLLECTION', 404);

  const { missing, records } = mapSheet(matrix, def);
  if (missing.length) {
    return {
      collection: collectionKey,
      dryRun,
      summary: { rows: 0, valid: 0, invalid: 0, duplicates: 0, inserted: 0 },
      errors: [{ row: 1, column: missing[0], message: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`, code: 'MISSING_COLUMN' }],
      preview: [],
    };
  }
  if (records.length === 0) {
    return {
      collection: collectionKey,
      dryRun,
      summary: { rows: 0, valid: 0, invalid: 0, duplicates: 0, inserted: 0 },
      errors: [{ row: 2, column: def.columns[0].header, message: 'The file has headers but no data rows.', code: 'EMPTY_FILE' }],
      preview: [],
    };
  }
  if (records.length > MAX_ROWS) {
    fail(`Import at most ${MAX_ROWS} rows at a time. Split the file and try again.`, 'TOO_MANY_ROWS', 413);
  }

  const [rooms, beds, guests, reservations] = await Promise.all([
    models.Room.find().lean(),
    models.Bed.find().lean(),
    models.Guest.find().lean(),
    models.Reservation.find({}, { id: 1, reference: 1, bedId: 1, arrival: 1, departure: 1, status: 1, _id: 0 }).lean(),
  ]);

  const roomByNumber = new Map(rooms.map((room) => [norm(room.number), room]));
  const bedByLabel = new Map(beds.map((bed) => [`${bed.roomId}|${norm(bed.label)}`, bed]));
  const bedsByRoom = new Map();
  beds.forEach((bed) => {
    if (!bedsByRoom.has(bed.roomId)) bedsByRoom.set(bed.roomId, []);
    bedsByRoom.get(bed.roomId).push(bed);
  });
  bedsByRoom.forEach((list) => list.sort((a, b) => a.number - b.number));

  const guestByEmail = new Map(guests.filter((guest) => guest.email).map((guest) => [norm(guest.email), guest]));
  const guestByName = new Map();
  guests.forEach((guest) => {
    const key = norm(guest.name);
    if (!guestByName.has(key)) guestByName.set(key, guest);
  });

  const reservationByReference = new Map(reservations.map((reservation) => [norm(reservation.reference), reservation]));
  const existingKeys = new Set();
  if (collectionKey === 'rooms') rooms.forEach((room) => existingKeys.add(norm(room.number)));
  if (collectionKey === 'guests') {
    guests.forEach((guest) => existingKeys.add(guest.email ? `email:${norm(guest.email)}` : `name:${norm(guest.name)}|${norm(guest.phone)}`));
  }
  if (collectionKey === 'reservations') reservations.forEach((reservation) => existingKeys.add(norm(reservation.reference)));
  if (collectionKey === 'payments') {
    const payments = await models.Payment.find({}, { reference: 1, _id: 0 }).lean();
    payments.forEach((payment) => existingKeys.add(norm(payment.reference)));
  }
  if (collectionKey === 'expenses') {
    const expenses = await models.Expense.find({}, { category: 1, vendor: 1, date: 1, amount: 1, _id: 0 }).lean();
    expenses.forEach((expense) => existingKeys.add([expense.category, norm(expense.vendor), expense.date, Number(expense.amount).toFixed(2)].join('|')));
  }
  if (collectionKey === 'tasks') {
    const [tasks, roomNumbers] = await Promise.all([
      models.Task.find({}, { title: 1, roomId: 1, due: 1, _id: 0 }).lean(),
      models.Room.find({}, { id: 1, number: 1, _id: 0 }).lean(),
    ]);
    const numberById = new Map(taskRooms(roomNumbers));
    tasks.forEach((task) => existingKeys.add([norm(task.title), norm(numberById.get(task.roomId)), task.due].join('|')));
  }

  const errors = [];
  const valid = [];
  const seen = new Set();
  let duplicates = 0;

  const pushError = (row, column, message, code = 'INVALID_VALUE') => {
    if (errors.length < 100) errors.push({ row, column, message, code });
  };

  records.forEach(({ row, record }) => {
    try {
      required(record, def);

      const parsed = {};
      def.columns.forEach((entry) => {
        try {
          parsed[entry.key] = parseCell(record[entry.key], entry);
        } catch (error) {
          throw new RowError(entry.header, error.message);
        }
      });

      const key = duplicateKey(collectionKey, parsed);
      const alreadyExists = key ? existingKeys.has(key) || seen.has(key) : false;
      if (key && alreadyExists) {
        throw new RowError(
          def.keyFields.map((field) => def.columns.find((entry) => entry.key === field)?.header || field).join(', '),
          'This record already exists, so the row was skipped.',
          'DUPLICATE',
        );
      }
      if (key) seen.add(key);

      let extra = {};

      if (collectionKey === 'reservations') {
        const guest = (parsed.guestEmail && guestByEmail.get(norm(parsed.guestEmail))) || (parsed.guestName && guestByName.get(norm(parsed.guestName)));
        if (!guest) {
          throw new RowError('Guest email', 'No guest matches this email or name. Import the guest first.', 'MISSING_RELATION');
        }
        const room = roomByNumber.get(norm(parsed.roomNumber));
        if (!room) {
          throw new RowError('Room number', 'No room matches this number. Import the room first.', 'MISSING_RELATION');
        }
        const roomBeds = bedsByRoom.get(room.id) || [];
        const bed = parsed.bedLabel
          ? bedByLabel.get(`${room.id}|${norm(parsed.bedLabel)}`)
          : roomBeds.find((candidate) => !candidate.outOfService && !candidate.maintenance);
        if (!bed) {
          throw new RowError(parsed.bedLabel ? 'Bed label' : 'Room number', 'No matching bed is available in this room.', 'MISSING_RELATION');
        }
        if (parsed.departure <= parsed.arrival) {
          throw new RowError('Departure', 'Departure must be after arrival.', 'INVALID_DATES');
        }
        if (parsed.reference && reservationByReference.has(norm(parsed.reference))) {
          throw new RowError('Reference', 'A reservation with this reference already exists.', 'DUPLICATE');
        }
        const overlap = reservations.some(
          (reservation) =>
            reservation.bedId === bed.id &&
            !['cancelled', 'noShow'].includes(reservation.status) &&
            reservation.arrival < parsed.departure &&
            reservation.departure > parsed.arrival,
        );
        if (overlap) {
          throw new RowError('Arrival', 'This bed is already booked for these dates.', 'BED_OVERLAP');
        }
        const nights = nightsBetween(parsed.arrival, parsed.departure);
        extra = {
          guest,
          room,
          bed,
          total: Math.max(0, parsed.rate * nights - parsed.discount),
        };
      }

      if (collectionKey === 'payments') {
        const reservation = reservationByReference.get(norm(parsed.reservationReference));
        if (!reservation) {
          throw new RowError('Reservation reference', 'No reservation matches this reference. Import reservations first.', 'MISSING_RELATION');
        }
        extra = { reservation };
      }

      if (collectionKey === 'tasks') {
        const room = roomByNumber.get(norm(parsed.roomNumber));
        if (!room) {
          throw new RowError('Room number', 'No room matches this number.', 'MISSING_RELATION');
        }
        extra = { room };
      }

      valid.push({ row, parsed, extra });
    } catch (error) {
      if (error instanceof RowError) {
        if (error.code === 'DUPLICATE') duplicates += 1;
        pushError(row, error.column, error.message, error.code);
      } else {
        pushError(row, 'Row', error.message);
      }
    }
  });

  const summary = {
    rows: records.length,
    valid: valid.length,
    invalid: records.length - valid.length,
    duplicates,
    inserted: 0,
  };

  if (dryRun || valid.length === 0) {
    return { collection: collectionKey, dryRun, summary, errors, preview: valid.slice(0, 20).map((entry) => entry.parsed) };
  }

  const now = new Date().toISOString();
  let inserted = 0;

  for (const { parsed, extra } of valid) {
    if (collectionKey === 'rooms') {
      const id = await nextIdFor('room', models.Room);
      await models.Room.create({
        id,
        number: parsed.number,
        type: parsed.type,
        audience: parsed.audience,
        floor: parsed.floor ?? 0,
        bedCount: parsed.bedCount,
        pricePerBed: parsed.pricePerBed,
        amenities: parsed.amenities || [],
        notes: parsed.notes || '',
        createdAt: todayISO(),
      });
      const bedsToInsert = Array.from({ length: parsed.bedCount }).map((_, index) => ({
        id: `bed_${parsed.number}_${index + 1}`,
        roomId: id,
        number: index + 1,
        label: `${parsed.number}-${String.fromCharCode(65 + index)}`,
        cleaning: false,
        maintenance: false,
        outOfService: false,
        note: '',
      }));
      if (bedsToInsert.length) await models.Bed.insertMany(bedsToInsert, { ordered: false }).catch(() => null);
    }

    if (collectionKey === 'guests') {
      await models.Guest.create({
        id: await nextIdFor('guest', models.Guest),
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        nationality: parsed.nationality,
        idType: parsed.idType || 'passport',
        idNumber: parsed.idNumber,
        notes: parsed.notes || '',
        createdAt: now,
      });
    }

    if (collectionKey === 'reservations') {
      const id = await nextIdFor('reservation', models.Reservation);
      const sequence = Number(String(id).split('_')[1]) || 1;
      await models.Reservation.create({
        id,
        reference: parsed.reference || reservationReference(sequence),
        guestId: extra.guest.id,
        roomId: extra.room.id,
        bedId: extra.bed.id,
        arrival: parsed.arrival,
        departure: parsed.departure,
        guests: parsed.guests || 1,
        rate: parsed.rate,
        discount: parsed.discount || 0,
        total: extra.total,
        paid: 0,
        source: parsed.source || 'direct',
        status: parsed.status || 'confirmed',
        notes: parsed.notes || '',
        createdAt: now,
        createdBy: actor?.name || '',
        guestName: extra.guest.name,
        roomNumber: extra.room.number,
        bedLabel: extra.bed.label,
      });
    }

    if (collectionKey === 'payments') {
      const reservation = extra.reservation;
      const guest = guests.find((entry) => entry.id === reservation.guestId);
      const room = rooms.find((entry) => entry.id === reservation.roomId);
      await models.Payment.create({
        id: await nextIdFor('payment', models.Payment),
        reservationId: reservation.id,
        guestId: reservation.guestId,
        guestName: guest?.name || '',
        reservationReference: reservation.reference,
        roomNumber: room?.number || '',
        amount: parsed.amount,
        method: parsed.method || 'card',
        type: parsed.type || 'payment',
        date: parsed.date,
        reference: parsed.reference || `PMT-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`,
        notes: parsed.notes || '',
        createdAt: now,
      });
      const delta = (parsed.type || 'payment') === 'refund' ? -parsed.amount : parsed.amount;
      const updated = await models.Reservation.findOneAndUpdate(
        { id: reservation.id },
        { $inc: { paid: delta } },
        { new: true },
      ).lean();
      if (updated && updated.paid < 0) {
        await models.Reservation.updateOne({ id: reservation.id }, { paid: 0 });
      }
    }

    if (collectionKey === 'expenses') {
      await models.Expense.create({
        id: await nextIdFor('expense', models.Expense),
        category: parsed.category,
        vendor: parsed.vendor,
        date: parsed.date,
        amount: parsed.amount,
        method: parsed.method || 'card',
        receipt: parsed.receipt || '',
        notes: parsed.notes || '',
        createdAt: now,
      });
    }

    if (collectionKey === 'tasks') {
      await models.Task.create({
        id: await nextIdFor('task', models.Task),
        type: parsed.type || 'cleaning',
        title: parsed.title,
        roomId: extra.room.id,
        priority: parsed.priority || 'medium',
        status: parsed.status || 'open',
        assigneeId: null,
        due: parsed.due,
        description: parsed.description || '',
        createdAt: now,
      });
    }

    inserted += 1;
  }

  summary.inserted = inserted;

  await logActivity({
    actor,
    action: 'data.imported',
    entity: 'data',
    entityId: collectionKey,
    meta: { collection: collectionKey, ...summary, errors: errors.length },
  });

  return { collection: collectionKey, dryRun: false, summary, errors, preview: [] };
}

/** Reads the first sheet (or the sheet matching the collection label) from a buffer. */
export function readWorkbook(buffer, collectionKey) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const def = COLLECTIONS[collectionKey];
  const preferred = def && workbook.SheetNames.find((name) => norm(name) === norm(def.label));
  const sheetName = preferred || workbook.SheetNames[0];
  if (!sheetName) fail('The workbook has no sheets.', 'EMPTY_FILE');
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  });
  return matrix;
}

function taskRooms(rooms) {
  return rooms.map((room) => [room.id, room.number]);
}
