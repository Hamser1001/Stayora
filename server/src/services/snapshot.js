import { models } from '../db/models.js';

const COLLECTIONS = ['Room', 'Bed', 'Guest', 'Reservation', 'Payment', 'Expense', 'Task', 'Notification'];

/**
 * The demo property is small, so reads load the workspace as plain objects and
 * reuse the same selectors as the client. Writes still go through Mongoose.
 */
export async function loadSnapshot() {
  const [rooms, beds, guests, reservations, payments, expenses, tasks, staff, notifications, setting] =
    await Promise.all([
      models.Room.find().lean(),
      models.Bed.find().lean(),
      models.Guest.find().lean(),
      models.Reservation.find().lean(),
      models.Payment.find().lean(),
      models.Expense.find().lean(),
      models.Task.find().lean(),
      models.Staff.find().lean(),
      models.Notification.find().lean(),
      models.Setting.findOne({ key: 'workspace' }).lean(),
    ]);

  return {
    version: 1,
    settings: setting?.data || {},
    rooms,
    beds,
    guests,
    reservations,
    payments,
    expenses,
    tasks,
    staff,
    notifications,
  };
}

export async function getSettings() {
  const setting = await models.Setting.findOne({ key: 'workspace' }).lean();
  return setting?.data || {};
}

export async function saveSettings(data) {
  const setting = await models.Setting.findOneAndUpdate(
    { key: 'workspace' },
    { key: 'workspace', data },
    { new: true, upsert: true, lean: true },
  );
  return setting.data;
}

/** Mirrors the client's id generator: prefix + next integer. */
export function nextId(prefix, items) {
  const max = items.reduce((highest, item) => {
    const numeric = Number(String(item.id).replace(/\D/g, ''));
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest;
  }, 0);
  return `${prefix}_${max + 1}`;
}

export async function idsFor(model, filter = {}) {
  const docs = await model.find(filter, { id: 1, _id: 0 }).lean();
  return docs.map((doc) => doc.id);
}

export { COLLECTIONS };
