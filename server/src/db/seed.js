import bcrypt from 'bcryptjs';
import { models } from './models.js';
import { buildSeedDatabase } from './seedData.js';

const DEMO_PASSWORD = 'stayora2026';

/**
 * Replaces the whole workspace with the deterministic demo dataset.
 * The same helper backs `npm run seed` and the settings "reset" endpoint.
 */
export async function seedDatabase() {
  const data = buildSeedDatabase();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const staff = data.staff.map((member) => ({ ...member, passwordHash }));

  await Promise.all([
    models.Room.deleteMany({}),
    models.Bed.deleteMany({}),
    models.Guest.deleteMany({}),
    models.Reservation.deleteMany({}),
    models.Payment.deleteMany({}),
    models.Expense.deleteMany({}),
    models.Task.deleteMany({}),
    models.Staff.deleteMany({}),
    models.Notification.deleteMany({}),
    models.Setting.deleteMany({}),
  ]);

  await Promise.all([
    models.Room.insertMany(data.rooms),
    models.Bed.insertMany(data.beds),
    models.Guest.insertMany(data.guests),
    models.Reservation.insertMany(data.reservations),
    models.Payment.insertMany(data.payments),
    models.Expense.insertMany(data.expenses),
    models.Task.insertMany(data.tasks),
    models.Staff.insertMany(staff),
    models.Notification.insertMany(data.notifications),
    models.Setting.create({ key: 'workspace', data: data.settings }),
  ]);

  return {
    rooms: data.rooms.length,
    beds: data.beds.length,
    guests: data.guests.length,
    reservations: data.reservations.length,
    payments: data.payments.length,
    expenses: data.expenses.length,
    tasks: data.tasks.length,
    staff: staff.length,
  };
}

export { DEMO_PASSWORD };
