/**
 * End-to-end checks for staff management and Excel import/export.
 * Run against a live API: node scripts/test-staff-data.js
 */
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { models } from '../src/db/models.js';

const BASE = process.env.API || 'http://localhost:4000/api';
const OWNER = { email: 'hamza@stayora.app', password: 'stayora2026' };
const created = { staff: [], rooms: [], guests: [], reservations: [], payments: [] };

let passed = 0;
let failed = 0;
const results = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    results.push(`  ✓ ${name}`);
  } else {
    failed += 1;
    results.push(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function call(path, { method = 'GET', token, body, raw = false } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

const login = async (email, password) => call('/auth/login', { method: 'POST', body: { email, password } });

function workbookBuffer(rows) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
}

async function main() {
  console.log(`Staff & Excel checks against ${BASE}\n`);

  const ownerLogin = await login(OWNER.email, OWNER.password);
  check('owner can sign in', ownerLogin.status === 200, ownerLogin.json?.message);
  const ownerToken = ownerLogin.json?.data?.token;
  const owner = ownerLogin.json?.data?.user;
  check('owner has full permissions', owner?.permissions?.includes('data') && owner?.permissions?.includes('staff'));

  check('staff list requires auth', (await call('/staff')).status === 401);
  check('bookings require auth', (await call('/reservations')).status === 401);

  const stamp = Date.now().toString().slice(-6);
  const email = `qa.${stamp}@stayora.test`;
  const created1 = await call('/staff', {
    method: 'POST',
    token: ownerToken,
    body: { name: 'QA Reception', email, role: 'receptionist', permissions: ['dashboard', 'reservations'] },
  });
  check('owner creates a staff member', created1.status === 201, created1.json?.message);
  const member = created1.json?.data?.member;
  const tempPassword = created1.json?.data?.temporaryPassword;
  created.staff.push(member?.id);
  check('creation returns a temporary password', typeof tempPassword === 'string' && tempPassword.length >= 8);
  check('new member must change password', member?.mustChangePassword === true);
  check('custom permissions are stored', JSON.stringify(member?.permissions) === JSON.stringify(['dashboard', 'reservations']));

  const duplicate = await call('/staff', {
    method: 'POST',
    token: ownerToken,
    body: { name: 'Duplicate', email, role: 'receptionist' },
  });
  check('duplicate email is rejected', duplicate.status === 409 || duplicate.status === 400, String(duplicate.status));

  const tempLogin = await login(email, tempPassword);
  check('staff signs in with the temporary password', tempLogin.status === 200, tempLogin.json?.message);
  const tempToken = tempLogin.json?.data?.token;

  const blocked = await call('/reservations', { token: tempToken });
  check('temporary password blocks protected APIs', blocked.status === 403 && blocked.json?.code === 'PASSWORD_CHANGE_REQUIRED', JSON.stringify(blocked.json));

  const weak = await call('/auth/change-password', { method: 'POST', token: tempToken, body: { currentPassword: tempPassword, newPassword: 'short' } });
  check('weak password is rejected', weak.status === 400 && weak.json?.code === 'WEAK_PASSWORD');

  const newPassword = `Stayora${stamp}9`;
  const changed = await call('/auth/change-password', { method: 'POST', token: tempToken, body: { currentPassword: tempPassword, newPassword } });
  check('password change succeeds', changed.status === 200, changed.json?.message);
  check('password flag cleared', changed.json?.data?.user?.mustChangePassword === false);

  const staffToken = tempLogin.json?.data?.token;
  check('first-login token still works after change', (await call('/reservations', { token: staffToken })).status === 200);
  check('module permission enforced (payments denied)', (await call('/payments', { token: staffToken })).status === 403);
  check('module permission enforced (staff denied)', (await call('/staff', { token: staffToken })).status === 403);
  check('module permission enforced (data denied)', (await call('/data/collections', { token: staffToken })).status === 403);

  const ownerDenied = await call('/reservations', { token: staffToken });
  check('granted module stays available', ownerDenied.status === 200);

  const permissionEscalation = await call(`/staff/${member.id}`, {
    method: 'PATCH',
    token: staffToken,
    body: { permissions: ['payments'] },
  });
  check('staff cannot edit accounts', permissionEscalation.status === 403);

  const edit = await call(`/staff/${member.id}`, {
    method: 'PATCH',
    token: ownerToken,
    body: { name: 'QA Reception Updated', role: 'receptionist', permissions: ['dashboard', 'reservations', 'guests'] },
  });
  check('owner edits name and permissions', edit.status === 200 && edit.json?.data?.name === 'QA Reception Updated');
  check('updated permissions returned', edit.json?.data?.permissions?.includes('guests'));
  check('new permission works immediately', (await call('/guests', { token: staffToken })).status === 200);

  const ownerSuspend = await call(`/staff/${owner.id}/status`, { method: 'PATCH', token: ownerToken, body: { status: 'suspended' } });
  check('owner cannot be suspended', ownerSuspend.status === 400, ownerSuspend.json?.code);

  const suspend = await call(`/staff/${member.id}/status`, { method: 'PATCH', token: ownerToken, body: { status: 'suspended' } });
  check('owner suspends member', suspend.status === 200 && suspend.json?.data?.status === 'suspended');
  check('suspended member cannot sign in', (await login(email, newPassword)).status === 403);
  check('suspended member token is rejected', (await call('/reservations', { token: staffToken })).status === 403);

  const reactivate = await call(`/staff/${member.id}/status`, { method: 'PATCH', token: ownerToken, body: { status: 'active' } });
  check('owner reactivates member', reactivate.status === 200 && reactivate.json?.data?.status === 'active');
  check('reactivated member can sign in', (await login(email, newPassword)).status === 200);

  const reset = await call(`/staff/${member.id}/reset-password`, { method: 'POST', token: ownerToken });
  check('password reset returns new temporary password', reset.status === 200 && typeof reset.json?.data?.temporaryPassword === 'string');
  check('reset forces password change', reset.json?.data?.member?.mustChangePassword === true);
  check('old password no longer works', (await login(email, newPassword)).status === 401);
  const resetLogin = await login(email, reset.json.data.temporaryPassword);
  check('temporary password works after reset', resetLogin.status === 200);

  const activity = await call(`/staff/${member.id}/activity`, { token: ownerToken });
  const actions = (activity.json?.data || []).map((entry) => entry.action);
  check('member activity is tracked', activity.status === 200 && actions.includes('staff.created') && actions.includes('auth.login'), actions.join(','));

  const manager2 = await call('/staff', {
    method: 'POST',
    token: ownerToken,
    body: { name: 'QA Manager', email: `qa.mgr.${stamp}@stayora.test`, role: 'manager' },
  });
  created.staff.push(manager2.json?.data?.member?.id);
  const mgrLogin = await login(`qa.mgr.${stamp}@stayora.test`, manager2.json.data.temporaryPassword);
  const mgrToken = mgrLogin.json?.data?.token;
  await call('/auth/change-password', { method: 'POST', token: mgrToken, body: { currentPassword: manager2.json.data.temporaryPassword, newPassword: `Manager${stamp}9` } });
  const mgrSelfEdit = await call(`/staff/${manager2.json.data.member.id}`, {
    method: 'PATCH',
    token: mgrToken,
    body: { name: 'QA Manager Renamed' },
  });
  check('manager can edit their own profile', mgrSelfEdit.status === 200, `${mgrSelfEdit.status} ${mgrSelfEdit.json?.message}`);
  const mgrOwnerEdit = await call(`/staff/${owner.id}`, { method: 'PATCH', token: mgrToken, body: { name: 'Hacked' } });
  check('manager cannot edit the owner', mgrOwnerEdit.status === 403);
  const mgrGrant = await call(`/staff/${member.id}`, { method: 'PATCH', token: mgrToken, body: { permissions: ['settings'] } });
  check('manager cannot grant settings access', mgrGrant.status === 403);

  /* --------------------------- Settings & prefs -------------------------- */
  const languagePref = await call('/auth/preferences', {
    method: 'PATCH',
    token: ownerToken,
    body: { language: 'fr' },
  });
  check('language preference is saved to the account', languagePref.json?.data?.user?.language === 'fr');
  check('saved language is returned on refresh', (await call('/auth/me', { token: ownerToken })).json?.data?.user?.language === 'fr');
  await call('/auth/preferences', { method: 'PATCH', token: ownerToken, body: { language: 'en' } });
  check('invalid language is rejected', (await call('/auth/preferences', { method: 'PATCH', token: ownerToken, body: { language: 'de' } })).status === 400);

  const beforeSettings = await call('/settings', { token: ownerToken });
  const reservationsBeforeReset = (await call('/reservations?pageSize=1', { token: ownerToken })).json?.meta?.total;
  const currencyPatch = await call('/settings', {
    method: 'PATCH',
    token: ownerToken,
    body: { currency: 'USD', timezone: 'Asia/Tokyo', notifications: { ...beforeSettings.json.data.notifications, digest: true } },
  });
  check('currency and timezone are persisted', currencyPatch.json?.data?.currency === 'USD' && currencyPatch.json?.data?.timezone === 'Asia/Tokyo');
  check('notification preferences are persisted', currencyPatch.json?.data?.notifications?.digest === true);

  const settingsReset = await call('/settings/reset', { method: 'POST', token: ownerToken });
  check('settings reset restores defaults', settingsReset.json?.data?.currency === beforeSettings.json?.data?.currency);
  check('settings reset keeps operational data', (await call('/reservations?pageSize=1', { token: ownerToken })).json?.meta?.total === reservationsBeforeReset);

  const notifications = await call('/notifications', { token: ownerToken });
  const unread = (notifications.json?.data || []).find((entry) => !entry.read);
  if (unread) {
    const marked = await call(`/notifications/${unread.id}/read`, { method: 'POST', token: ownerToken });
    check('notification can be marked read', marked.json?.data?.read === true);
  } else {
    check('notification can be marked read', true, 'no unread notification');
  }

  /* ------------------------------- Excel ------------------------------- */
  const collections = await call('/data/collections', { token: ownerToken });
  check('collections endpoint lists importable data', collections.status === 200 && collections.json?.data?.length >= 6);

  const exportRes = await call('/data/export?collections=rooms,guests,reservations', { token: ownerToken, raw: true });
  check('export returns an xlsx file', exportRes.status === 200 && exportRes.buffer.subarray(0, 2).toString() === 'PK');
  check('export sets a download filename', /stayora-export-.*\.xlsx/.test(exportRes.headers.get('content-disposition') || ''));
  const exported = XLSX.read(exportRes.buffer, { type: 'buffer' });
  check('workbook has one sheet per collection', exported.SheetNames.includes('Rooms') && exported.SheetNames.includes('Guests') && exported.SheetNames.includes('Reservations'), exported.SheetNames.join(','));
  const roomSheet = XLSX.utils.sheet_to_json(exported.Sheets.Rooms, { header: 1 });
  check('exported room headers are labelled', roomSheet[0]?.includes('Room number') && roomSheet[0]?.includes('Beds'));

  check('receptionist without data access cannot export', (await call('/data/export', { token: staffToken, raw: true })).status === 403);

  const roomNumber = `QA${stamp}`;
  const roomFile = workbookBuffer([
    { 'Room number': roomNumber, 'Room type': 'dorm', Audience: 'mixed', Floor: 2, Beds: 3, 'Price per bed': 19, Amenities: 'wifi, lockers', Notes: 'QA import' },
    { 'Room number': '101', 'Room type': 'dorm', Beds: 2, 'Price per bed': 20 },
  ]);
  const roomDry = await call('/data/import', { method: 'POST', token: ownerToken, body: { collection: 'rooms', file: roomFile, dryRun: true } });
  check('room dry run validates rows', roomDry.status === 200 && roomDry.json?.data?.summary?.valid === 1, JSON.stringify(roomDry.json?.data?.summary));
  check('duplicate room number is reported', roomDry.json?.data?.errors?.some((entry) => entry.code === 'DUPLICATE'));

  const badFile = Buffer.from('not an excel file').toString('base64');
  const badImport = await call('/data/import', { method: 'POST', token: ownerToken, body: { collection: 'rooms', file: badFile } });
  check('invalid workbook is rejected', badImport.status === 400, String(badImport.status));

  const missingColumn = workbookBuffer([{ 'Room number': 'QA-X', 'Room type': 'dorm' }]);
  const missingRes = await call('/data/import', { method: 'POST', token: ownerToken, body: { collection: 'rooms', file: missingColumn } });
  check('missing columns are reported', missingRes.json?.data?.errors?.[0]?.code === 'MISSING_COLUMN', JSON.stringify(missingRes.json?.data?.errors?.[0]));

  const roomCommit = await call('/data/import', { method: 'POST', token: ownerToken, body: { collection: 'rooms', file: roomFile } });
  check('room import commits valid rows', roomCommit.json?.data?.summary?.inserted === 1, JSON.stringify(roomCommit.json?.data?.summary));
  const roomsAfter = await call('/rooms?limit=500', { token: ownerToken });
  const importedRoom = (roomsAfter.json?.data || []).find((room) => room.number === roomNumber);
  created.rooms.push(importedRoom?.id);
  check('imported room exists', Boolean(importedRoom));
  check('imported room has its beds', importedRoom?.beds?.length === 3, String(importedRoom?.beds?.length));

  const guestEmail = `qa.guest.${stamp}@stayora.test`;
  const guestFile = workbookBuffer([{ 'Full name': 'QA Guest', Email: guestEmail, Phone: '+330000', Nationality: 'FR' }]);
  const guestCommit = await call('/data/import', { method: 'POST', token: ownerToken, body: { collection: 'guests', file: guestFile } });
  check('guest import commits', guestCommit.json?.data?.summary?.inserted === 1, JSON.stringify(guestCommit.json?.data?.summary));

  const resFile = workbookBuffer([
    { 'Guest email': guestEmail, 'Room number': roomNumber, Arrival: '2026-12-01', Departure: '2026-12-04', Rate: 19, Status: 'confirmed' },
    { 'Guest email': 'nobody@nowhere.test', 'Room number': roomNumber, Arrival: '2026-12-01', Departure: '2026-12-02', Rate: 19 },
  ]);
  const resDry = await call('/data/import', { method: 'POST', token: ownerToken, body: { collection: 'reservations', file: resFile, dryRun: true } });
  check('reservation dry run links guest and room', resDry.json?.data?.summary?.valid === 1);
  check('unknown guest is a relationship error', resDry.json?.data?.errors?.some((entry) => entry.code === 'MISSING_RELATION'));
  const resCommit = await call('/data/import', { method: 'POST', token: ownerToken, body: { collection: 'reservations', file: resFile } });
  check('reservation import commits', resCommit.json?.data?.summary?.inserted === 1, JSON.stringify(resCommit.json?.data?.summary));

  const reservations = await call(`/reservations?search=${encodeURIComponent('QA Guest')}`, { token: ownerToken });
  const importedReservation = (reservations.json?.data || []).find((entry) => entry.guestName === 'QA Guest');
  created.reservations.push(importedReservation?.id);
  check('imported reservation preserves relationships', importedReservation?.roomNumber === roomNumber && importedReservation?.guestName === 'QA Guest');
  check('imported reservation total is computed', importedReservation?.total === 57, String(importedReservation?.total));

  const payFile = workbookBuffer([
    { 'Reservation reference': importedReservation?.reference, Amount: 20, Method: 'cash', Date: '2026-11-20' },
  ]);
  const payCommit = await call('/data/import', { method: 'POST', token: ownerToken, body: { collection: 'payments', file: payFile } });
  check(
    'payment import commits',
    payCommit.json?.data?.summary?.inserted === 1,
    `${payCommit.status} ${JSON.stringify(payCommit.json?.message)} ${JSON.stringify(payCommit.json?.data?.errors)}`,
  );
  const paidList = await call(`/reservations?search=${encodeURIComponent('QA Guest')}`, { token: ownerToken });
  const paidReservation = (paidList.json?.data || []).find((entry) => entry.id === importedReservation?.id);
  check('payment updates reservation paid total', paidReservation?.paid === 20, String(paidReservation?.paid));
  const payments = await call(`/payments?search=${encodeURIComponent(importedReservation?.reference || '')}`, { token: ownerToken });
  created.payments.push(...(payments.json?.data || []).filter((p) => p.reservationReference === importedReservation?.reference).map((p) => p.id));

  /* ------------------------------ Cleanup ------------------------------ */
  await mongoose.connect(process.env.MONGODB_URI || env.mongoUri);
  const guests = await models.Guest.find({ email: guestEmail }).lean();
  const guestIds = guests.map((guest) => guest.id);
  const reservationsToDelete = await models.Reservation.find({ guestId: { $in: guestIds } }).lean();
  await models.Payment.deleteMany({ reservationId: { $in: reservationsToDelete.map((entry) => entry.id) } });
  await models.Reservation.deleteMany({ guestId: { $in: guestIds } });
  await models.Room.deleteMany({ number: roomNumber });
  await models.Bed.deleteMany({ roomId: { $in: created.rooms.filter(Boolean) } });
  await models.Guest.deleteMany({ email: guestEmail });
  await mongoose.disconnect();

  for (const id of created.staff.filter(Boolean)) {
    await call(`/staff/${id}`, { method: 'DELETE', token: ownerToken });
  }
  const remaining = await call(`/staff`, { token: ownerToken });
  check('staff deletion is permanent', !(remaining.json?.data || []).some((entry) => entry.email === email));

  console.log(results.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Test run crashed:', error);
  process.exitCode = 1;
});
