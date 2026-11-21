#!/usr/bin/env node
/**
 * Public booking regression tests.
 *
 * Run against a live API with the demo workspace seeded:
 *
 *   npm run test:booking
 *
 * Proves that the website booking flow writes real reservations into the same
 * engine the dashboard uses: availability rules, date and guest validation,
 * totals, duplicate protection, privacy of the response, and cleanup.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const API = process.env.API_URL || 'http://localhost:4000/api';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/stayora';
const SLUG = process.env.SITE_SLUG || 'brothers-surf-camp';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text, headers: response.headers };
}

const iso = (offsetDays) => {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const arrival = iso(21);
const departure = iso(24);
const email = `booking.test.${Date.now()}@example.com`;
const mongo = new MongoClient(MONGO_URI);
await mongo.connect();
const db = mongo.db();

let option = null;
let reference = null;
// Cleanup only ever touches reservations this run created, matched by their
// unique reference — never a source-based filter that could hit seeded data.
const createdRefs = new Set();
const createdEmails = new Set([email]);

try {
  /* -------------------------------- Validation ------------------------------ */

  const noDates = await call(`/public/sites/${SLUG}/availability`);
  record('Availability requires dates', noDates.status === 400, `status ${noDates.status}`);

  const past = await call(`/public/sites/${SLUG}/availability?arrival=${iso(-2)}&departure=${iso(1)}`);
  record('Past arrivals are rejected', past.status === 400 && past.json?.code === 'INVALID_DATES');

  const tooLong = await call(`/public/sites/${SLUG}/availability?arrival=${iso(1)}&departure=${iso(45)}`);
  record('Stays longer than 30 nights are rejected', tooLong.status === 400, `status ${tooLong.status}`);

  const unknownSite = await call('/public/sites/not-a-site/availability?arrival=2027-01-10&departure=2027-01-12');
  record('Unknown websites are rejected', unknownSite.status === 404, `status ${unknownSite.status}`);

  /* ------------------------------- Availability ----------------------------- */

  const availability = await call(`/public/sites/${SLUG}/availability?arrival=${arrival}&departure=${departure}&guests=1`);
  const options = availability.json?.data?.options || [];
  record('Availability returns real room options', availability.status === 200 && options.length > 0, `${options.length} rooms`);
  record(
    'Availability includes per-night pricing and totals',
    options.every((room) => room.pricePerBed > 0 && room.nights === 3 && room.total === room.pricePerBed * 3),
    'price × nights',
  );
  record(
    'Availability exposes no bed ids or guest data',
    !/bedId|guestId|guestName|email|idNumber/.test(availability.text),
    'inventory only',
  );

  const large = await call(`/public/sites/${SLUG}/availability?arrival=${arrival}&departure=${departure}&guests=20`);
  record(
    'A party larger than a room is not offered that room',
    (large.json?.data?.options || []).every((room) => room.available === false),
    'available=false',
  );

  /* --------------------------------- Booking -------------------------------- */

  option = options.find((room) => room.available);
  const guest = { name: 'Website Booking Test', email, phone: '+212 600 112233', country: 'Morocco' };

  const badRoom = await call(`/public/sites/${SLUG}/bookings`, {
    method: 'POST',
    body: { roomId: 'rom_does_not_exist', arrival, departure, guests: 1, guest },
  });
  record('Unknown rooms are rejected', badRoom.status === 404, `status ${badRoom.status}`);

  const badEmail = await call(`/public/sites/${SLUG}/bookings`, {
    method: 'POST',
    body: { roomId: option.roomId, arrival, departure, guests: 1, guest: { ...guest, email: 'not-an-email' } },
  });
  record('Invalid emails are rejected', badEmail.status === 400 && badEmail.json?.code === 'INVALID_EMAIL');

  const badPhone = await call(`/public/sites/${SLUG}/bookings`, {
    method: 'POST',
    body: { roomId: option.roomId, arrival, departure, guests: 1, guest: { ...guest, phone: '12' } },
  });
  record('Invalid phone numbers are rejected', badPhone.status === 400 && badPhone.json?.code === 'INVALID_PHONE');

  const honeypot = await call(`/public/sites/${SLUG}/bookings`, {
    method: 'POST',
    body: { roomId: option.roomId, arrival, departure, guests: 1, guest, company: 'spam' },
  });
  record('Honeypot submissions are rejected', honeypot.status === 400, `status ${honeypot.status}`);

  const tooMany = await call(`/public/sites/${SLUG}/bookings`, {
    method: 'POST',
    body: {
      roomId: option.roomId,
      arrival,
      departure,
      guests: option.capacity + 1,
      guest: { ...guest, email: `over.${email}` },
    },
  });
  record('Parties larger than the room are rejected', tooMany.status === 400, `status ${tooMany.status}`);

  const created = await call(`/public/sites/${SLUG}/bookings`, {
    method: 'POST',
    body: { roomId: option.roomId, arrival, departure, guests: 1, guest },
  });
  const booking = created.json?.data;
  reference = booking?.reference || null;
  if (reference) createdRefs.add(reference);
  record('A public booking is created', created.status === 201 && Boolean(reference), `status ${created.status}`);
  record(
    'Bookings arrive as pending and unpaid',
    booking?.status === 'pending',
    `status=${booking?.status}`,
  );
  record(
    'The total matches nights × rate',
    booking?.total === option.pricePerBed * 3 && booking?.nights === 3,
    `${booking?.total} EUR`,
  );
  record(
    'The response exposes no guest identity',
    !/guestId|email|phone|passport|idNumber/.test(created.text),
    'confirmation only',
  );

  const stored = reference
    ? await db.collection('reservations').findOne({ reference })
    : null;
  record(
    'The reservation exists in the shared reservation store',
    Boolean(stored) && stored.source === 'website' && stored.status === 'pending' && stored.paid === 0,
    `source=${stored?.source}`,
  );

  const dup = await call(`/public/sites/${SLUG}/bookings`, {
    method: 'POST',
    body: { roomId: option.roomId, arrival, departure, guests: 1, guest },
  });
  if (dup.json?.data?.reference) createdRefs.add(dup.json.data.reference);
  const dupCount = reference ? await db.collection('reservations').countDocuments({ reference }) : 0;
  record(
    'A repeated submit does not double-book',
    dup.status === 200 && dup.json?.data?.duplicate === true && dupCount === 1,
    `status ${dup.status}`,
  );

  const after = await call(`/public/sites/${SLUG}/availability?arrival=${arrival}&departure=${departure}&guests=1`);
  const afterRooms = after.json?.data?.options || [];
  const before = options.find((room) => room.roomId === option.roomId);
  const now = afterRooms.find((room) => room.roomId === option.roomId);
  record(
    'Availability reflects the new booking',
    Boolean(before) && (!now || now.bedsAvailable === before.bedsAvailable - 1),
    `beds ${before?.bedsAvailable} → ${now?.bedsAvailable ?? 0}`,
  );

  // Fill the remaining beds of this room, then expect a clean 409.
  if (now?.bedsAvailable) {
    for (let index = 0; index < now.bedsAvailable; index += 1) {
      const fillMail = `fill.${index}.${email}`;
      createdEmails.add(fillMail);
      const filled = await call(`/public/sites/${SLUG}/bookings`, {
        method: 'POST',
        body: {
          roomId: option.roomId,
          arrival,
          departure,
          guests: 1,
          guest: { ...guest, name: `Website Fill ${index + 1}`, email: fillMail },
        },
      });
      if (filled.json?.data?.reference) createdRefs.add(filled.json.data.reference);
    }
  }
  const soldOut = await call(`/public/sites/${SLUG}/bookings`, {
    method: 'POST',
    body: {
      roomId: option.roomId,
      arrival,
      departure,
      guests: 1,
      guest: { ...guest, name: 'Website Sold Out', email: `sold.${email}` },
    },
  });
  record(
    'A fully booked room cannot be reserved',
    soldOut.status === 409 && soldOut.json?.code === 'NO_BED_AVAILABLE',
    `status ${soldOut.status}${soldOut.json?.code ? ` ${soldOut.json.code}` : ''}`,
  );

  const audit = await db.collection('reservations').countDocuments({ source: 'website' });
  record('Website bookings carry the website source', audit > 0, `${audit} website reservations`);
} catch (error) {
  record('Test harness completed without crashing', false, error.stack?.split('\n')[0] || error.message);
} finally {
  /* --------------------------------- Cleanup -------------------------------- */
  const venues = await db
    .collection('reservations')
    .find({ reference: { $in: [...createdRefs] } })
    .toArray();
  const testIds = venues.map((row) => row.id);
  if (testIds.length) {
    await db.collection('payments').deleteMany({ reservationId: { $in: testIds } });
    await db.collection('reservations').deleteMany({ id: { $in: testIds } });
  }
  await db.collection('guests').deleteMany({ email: { $in: [...createdEmails] } });
  console.log(`Cleaned up ${testIds.length} test reservation(s).`);
  await mongo.close();
}

const passed = results.filter((row) => row.ok).length;
console.log(`\n${passed}/${results.length} booking checks passed.`);
if (passed !== results.length) {
  console.log('\nFailures:');
  for (const row of results.filter((entry) => !entry.ok)) {
    console.log(`- ${row.name}${row.detail ? `: ${row.detail}` : ''}`);
  }
}
process.exit(passed === results.length ? 0 : 1);
