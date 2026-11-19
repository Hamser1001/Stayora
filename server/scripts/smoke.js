import { connectDatabase, disconnectDatabase } from '../src/db/connect.js';
import { models } from '../src/db/models.js';

/**
 * Smoke + integrity check.
 *   node scripts/smoke.js            # API endpoints against http://localhost:4000/api
 *   node scripts/smoke.js --db-only  # skip HTTP, only verify the dataset
 */

const BASE = process.env.BASE_URL || 'http://localhost:4000/api';
const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function timedFetch(path, { token, method = 'GET', body } = {}) {
  const started = performance.now();
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload, ms: Math.round(performance.now() - started) };
}

async function apiChecks() {
  const login = await timedFetch('/auth/login', {
    method: 'POST',
    body: { email: 'hamza@stayora.app', password: 'stayora2026' },
  });
  const token = login.payload?.data?.token;
  record('POST /auth/login', login.status === 200 && Boolean(token), `${login.ms}ms`);
  if (!token) return;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const listChecks = [
    ['GET /reservations', '/reservations?page=1&pageSize=12&sort=arrival&direction=desc', (p) => Array.isArray(p.data) && p.meta?.total >= 0 && p.data.length <= 12],
    ['GET /reservations (filtered)', '/reservations?page=1&pageSize=12&status=confirmed&search=STY', (p) => Array.isArray(p.data) && p.meta?.counts?.inHouse >= 0],
    ['GET /reservations (page 2)', '/reservations?page=2&pageSize=12', (p) => Array.isArray(p.data) && p.meta?.page === 2],
    ['GET /reservations/outstanding', '/reservations/outstanding?limit=50', (p) => Array.isArray(p.data) && p.data.length <= 50 && p.data.every((r) => r.balance > 0)],
    ['GET /guests', '/guests?page=1&pageSize=12&sort=name', (p) => Array.isArray(p.data) && p.data.length <= 12 && p.meta?.counts?.all > 0],
    ['GET /guests (balance filter)', '/guests?page=1&pageSize=12&filter=balance', (p) => Array.isArray(p.data) && p.data.every((g) => g.outstanding > 0)],
    ['GET /guests/options', '/guests/options', (p) => Array.isArray(p.data) && p.data.length > 0 && p.data[0].name],
    ['GET /payments', `/payments?page=1&pageSize=25&from=${monthStart}&to=${today}`, (p) => Array.isArray(p.data) && p.data.length <= 25 && p.meta?.total >= 0],
    ['GET /payments/summary', `/payments/summary?start=${monthStart}&end=${today}`, (p) => typeof p.data?.collected === 'number'],
    ['GET /expenses', `/expenses?page=1&pageSize=25&from=${monthStart}&to=${today}`, (p) => Array.isArray(p.data) && p.data.length <= 25],
    ['GET /expenses/summary', `/expenses/summary?start=${monthStart}&end=${today}`, (p) => Array.isArray(p.data?.byCategory)],
    ['GET /rooms', '/rooms', (p) => Array.isArray(p.data) && p.data.length > 0 && Array.isArray(p.data[0].beds)],
    ['GET /housekeeping', '/housekeeping', (p) => Array.isArray(p.data)],
    ['GET /staff', '/staff', (p) => Array.isArray(p.data) && p.data.every((s) => !s.passwordHash)],
    ['GET /dashboard', `/dashboard?start=${monthStart}&end=${today}`, (p) => p.data?.metrics && Array.isArray(p.data?.series)],
    ['GET /reports', `/reports?start=${monthStart}&end=${today}`, (p) => p.data?.metrics && Array.isArray(p.data?.monthly)],
    ['GET /notifications', '/notifications', (p) => Array.isArray(p.data) && p.data.length <= 40],
    ['GET /settings', '/settings', (p) => p.data?.name],
    ['GET /reservations/calendar', `/reservations/calendar?start=${monthStart}&end=${today}`, (p) => Array.isArray(p.data?.reservations)],
    ['GET /reservations/availability', `/reservations/availability?arrival=${today}&departure=${today.slice(0, 8)}28`, (p) => Array.isArray(p.data)],
  ];

  for (const [name, path, validate] of listChecks) {
    const res = await timedFetch(path, { token });
    const ok = res.status === 200 && validate(res.payload || {});
    record(name, ok, `${res.ms}ms${ok ? '' : ` status ${res.status}`}`);
  }

  // Write path: create a guest + reservation, pay it, then clean up.
  const stamp = Date.now();
  const guest = await timedFetch('/guests', {
    token,
    method: 'POST',
    body: { name: `Smoke Test ${stamp}`, email: `smoke${stamp}@example.com` },
  });
  record('POST /guests', guest.status === 201 && guest.payload?.data?.id, `${guest.ms}ms`);

  const availability = await timedFetch(
    `/reservations/availability?arrival=${today}&departure=${today.slice(0, 8)}28`,
    { token },
  );
  const bed = availability.payload?.data?.[0];
  if (guest.payload?.data?.id && bed) {
    const reservation = await timedFetch('/reservations', {
      token,
      method: 'POST',
      body: {
        guestId: guest.payload.data.id,
        roomId: bed.roomId,
        bedId: bed.id,
        arrival: today,
        departure: `${today.slice(0, 8)}28`,
        guests: 1,
        source: 'direct',
      },
    });
    record('POST /reservations', reservation.status === 201 && reservation.payload?.data?.reference, `${reservation.ms}ms`);

    const created = reservation.payload?.data;
    if (created?.id) {
      const payment = await timedFetch('/payments', {
        token,
        method: 'POST',
        body: { reservationId: created.id, amount: 10, method: 'cash' },
      });
      record('POST /payments', payment.status === 201, `${payment.ms}ms`);

      const status = await timedFetch(`/reservations/${created.id}/status`, {
        token,
        method: 'PATCH',
        body: { status: 'checkedIn' },
      });
      record('PATCH /reservations/:id/status', status.status === 200 && status.payload?.data?.status === 'checkedIn', `${status.ms}ms`);

      const after = await timedFetch(`/reservations/${created.id}`, { token });
      record(
        'Paid total reflects ledger',
        Math.abs((after.payload?.data?.paid || 0) - 10) < 0.01,
        `paid=${after.payload?.data?.paid}`,
      );

      await models.Payment.deleteMany({ reservationId: created.id });
      await models.Reservation.deleteOne({ id: created.id });
      await models.Reservation.updateOne({ id: created.id }, { $set: {} });
    }
    if (guest.payload?.data?.id) await models.Guest.deleteOne({ id: guest.payload.data.id });
  } else {
    record('POST /reservations', false, 'no available bed returned by availability');
  }
}

async function integrityChecks() {
  const [reservations, payments, guests, rooms, beds, counters] = await Promise.all([
    models.Reservation.countDocuments(),
    models.Payment.countDocuments(),
    models.Guest.countDocuments(),
    models.Room.countDocuments(),
    models.Bed.countDocuments(),
    models.Counter.find().lean(),
  ]);
  record('Dataset size 30k–50k documents', reservations + payments + guests + rooms + beds > 30000 && reservations + payments + guests + rooms + beds < 50000, `${reservations + payments + guests + rooms + beds} docs`);

  const orphanGuests = await models.Reservation.countDocuments({ guestId: { $nin: await models.Guest.distinct('id') } });
  record('Every reservation references a guest', orphanGuests === 0, `${orphanGuests} orphans`);

  const orphanRooms = await models.Reservation.countDocuments({ roomId: { $nin: await models.Room.distinct('id') } });
  const orphanBeds = await models.Reservation.countDocuments({ bedId: { $nin: await models.Bed.distinct('id') } });
  record('Every reservation references a room and bed', orphanRooms === 0 && orphanBeds === 0, `${orphanRooms}/${orphanBeds} orphans`);

  const orphanPayments = await models.Payment.countDocuments({ reservationId: { $nin: await models.Reservation.distinct('id') } });
  record('Every payment references a reservation', orphanPayments === 0, `${orphanPayments} orphans`);

  const mismatchedNames = await models.Reservation.countDocuments({
    $expr: { $ne: ['$guestName', ''] },
  });
  record('Denormalised guest names present', mismatchedNames === reservations, `${mismatchedNames}/${reservations}`);

  // paid total vs ledger for a random sample.
  const sample = await models.Reservation.aggregate([{ $sample: { size: 300 } }]);
  const ledger = await models.Payment.aggregate([
    { $match: { reservationId: { $in: sample.map((r) => r.id) } } },
    {
      $group: {
        _id: '$reservationId',
        total: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] } },
      },
    },
  ]);
  const ledgerMap = new Map(ledger.map((row) => [row._id, Math.round(row.total * 100) / 100]));
  const mismatches = sample.filter(
    (reservation) => Math.abs((reservation.paid || 0) - (ledgerMap.get(reservation.id) || 0)) > 0.01,
  );
  record('Reservation.paid matches payment ledger (300 sample)', mismatches.length === 0, `${mismatches.length} mismatches`);

  // Overlapping stays on the same bed would be a data error.
  const overlap = await models.Reservation.aggregate([
    { $match: { status: { $nin: ['cancelled', 'noShow'] } } },
    { $sort: { bedId: 1, arrival: 1 } },
    {
      $group: {
        _id: '$bedId',
        stays: { $push: { arrival: '$arrival', departure: '$departure' } },
      },
    },
    {
      $project: {
        conflicts: {
          $size: {
            $filter: {
              input: { $range: [1, { $size: '$stays' }] },
              as: 'i',
              cond: {
                $lt: [
                  { $arrayElemAt: ['$stays.arrival', '$$i'] },
                  { $arrayElemAt: ['$stays.departure', { $subtract: ['$$i', 1] }] },
                ],
              },
            },
          },
        },
      },
    },
    { $match: { conflicts: { $gt: 0 } } },
    { $count: 'beds' },
  ]);
  record('No overlapping reservations per bed', (overlap[0]?.beds || 0) === 0, `${overlap[0]?.beds || 0} beds with overlaps`);

  const counterRows = counters.reduce((sum, counter) => sum + counter.value, 0);
  record('Id counters initialised', counterRows > 0, `${counters.length} counters`);

  // Key indexes present.
  const indexNames = (await models.Reservation.collection.indexes()).map((index) => Object.keys(index.key).join('+'));
  for (const required of ['status+arrival', 'guestId+arrival', 'bedId+arrival+departure', 'createdAt']) {
    record(`Index on reservations {${required}}`, indexNames.includes(required), indexNames.join(', '));
  }
  const paymentIndexes = (await models.Payment.collection.indexes()).map((index) => Object.keys(index.key).join('+'));
  record('Index on payments {date+createdAt}', paymentIndexes.includes('date+createdAt'), paymentIndexes.join(', '));
}

async function main() {
  await connectDatabase();
  await integrityChecks();
  if (!process.argv.includes('--db-only')) await apiChecks();
  await disconnectDatabase();

  console.log(`\n${results.length - failures}/${results.length} checks passed.`);
  if (failures > 0) {
    console.log('\nFailures:');
    results.filter((result) => !result.ok).forEach((result) => console.log(`- ${result.name}: ${result.detail}`));
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
