#!/usr/bin/env node
/**
 * Rebuilds the denormalised reservation fields from their source records.
 *
 * `Reservation.paid` is a running total of the payment ledger and
 * `guestName`/`roomNumber`/`bedLabel` are copies of the guest and bed they
 * point at. Data seeded before the generator maintained them carries a zero
 * `paid` and no names, which makes every booking look unpaid.
 *
 * This only ever writes rows that disagree with their source; every other
 * document is left untouched. It runs as a dry run unless you pass --apply, and
 * writes a JSON backup of the reservations it changes first.
 *
 *   npm run repair:derived            # report what would change
 *   npm run repair:derived -- --apply # backup, then write
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { models } from '../src/db/models.js';
import { env } from '../src/config/env.js';

const APPLY = process.argv.includes('--apply');
const ROUND = (value) => Math.round(value * 100) / 100;

async function main() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  console.log(`Connected to ${env.mongoUri}`);

  const [reservations, guests, rooms, beds, ledger] = await Promise.all([
    db.collection('reservations').find({}).toArray(),
    db.collection('guests').find({}, { projection: { id: 1, name: 1 } }).toArray(),
    db.collection('rooms').find({}, { projection: { id: 1, number: 1 } }).toArray(),
    db.collection('beds').find({}, { projection: { id: 1, label: 1 } }).toArray(),
    db
      .collection('payments')
      .aggregate([
        {
          $group: {
            _id: '$reservationId',
            total: {
              $sum: { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] },
            },
          },
        },
      ])
      .toArray(),
  ]);

  const guestById = new Map(guests.map((guest) => [guest.id, guest.name]));
  const roomById = new Map(rooms.map((room) => [room.id, room.number]));
  const bedById = new Map(beds.map((bed) => [bed.id, bed.label]));
  const paidByReservation = new Map(ledger.map((row) => [row._id, ROUND(row.total)]));

  const changed = [];
  for (const reservation of reservations) {
    const next = {};
    const paid = Math.max(0, paidByReservation.get(reservation.id) || 0);
    if (Math.abs((reservation.paid || 0) - paid) > 0.01) next.paid = paid;

    const guestName = guestById.get(reservation.guestId);
    if (guestName && reservation.guestName !== guestName) next.guestName = guestName;
    const roomNumber = roomById.get(reservation.roomId);
    if (roomNumber && reservation.roomNumber !== roomNumber) next.roomNumber = roomNumber;
    const bedLabel = bedById.get(reservation.bedId);
    if (bedLabel && reservation.bedLabel !== bedLabel) next.bedLabel = bedLabel;

    if (Object.keys(next).length > 0) changed.push({ _id: reservation._id, id: reservation.id, next });
  }

  const paidFixes = changed.filter((row) => 'paid' in row.next).length;
  const nameFixes = changed.filter((row) => 'guestName' in row.next || 'roomNumber' in row.next || 'bedLabel' in row.next).length;
  console.log(
    `${reservations.length} reservations scanned · ${paidFixes} with a stored total differing from the ledger · ${nameFixes} with missing or stale guest/room/bed labels`,
  );

  if (changed.length === 0) {
    console.log('Nothing to repair.');
    return;
  }

  if (!APPLY) {
    console.log('Dry run — nothing written. Re-run with --apply to repair these rows.');
    return;
  }

  const dataDir = path.resolve(process.cwd(), '..', '.data');
  fs.mkdirSync(dataDir, { recursive: true });
  const backupPath = path.join(dataDir, `reservations-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(reservations, null, 2));
  console.log(`Backup written to ${backupPath}`);

  const result = await db.collection('reservations').bulkWrite(
    changed.map((row) => ({ updateOne: { filter: { _id: row._id }, update: { $set: row.next } } })),
    { ordered: false },
  );
  console.log(`Repaired ${result.modifiedCount} reservations.`);
}

main()
  .catch((error) => {
    console.error(`Repair failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
