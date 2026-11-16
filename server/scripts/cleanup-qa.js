import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { models } from '../src/db/models.js';

await mongoose.connect(env.mongoUri);

const guestIds = (await models.Guest.find({ email: /qa\.guest\./ }).lean()).map((g) => g.id);
const reservationIds = (
  await models.Reservation.find({ $or: [{ guestId: { $in: guestIds } }, { guestName: 'QA Guest' }] }).lean()
).map((r) => r.id);
const rooms = await models.Room.find({ number: /^QA/ }).lean();
const roomIds = rooms.map((r) => r.id);

const output = {
  guests: (await models.Guest.deleteMany({ $or: [{ id: { $in: guestIds } }, { email: /qa\.guest\./ }] })).deletedCount,
  reservations: (await models.Reservation.deleteMany({ id: { $in: reservationIds } })).deletedCount,
  payments: (await models.Payment.deleteMany({ $or: [{ reservationId: { $in: reservationIds } }, { guestId: { $in: guestIds } }] })).deletedCount,
  rooms: (await models.Room.deleteMany({ id: { $in: roomIds } })).deletedCount,
  beds: (await models.Bed.deleteMany({ roomId: { $in: roomIds } })).deletedCount,
  staff: (await models.Staff.deleteMany({ email: /^qa\./ })).deletedCount,
  activity: (await models.Activity.deleteMany({ actorName: { $in: ['QA Reception Updated', 'QA Manager'] } })).deletedCount,
};

console.log(output);
await mongoose.disconnect();
