import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { models } from '../db/models.js';
import { loadSnapshot, nextId } from '../services/snapshot.js';
import { todayISO } from '../lib/dates.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
const INVITE_PASSWORD = 'stayora2026';

/* ------------------------------ Housekeeping ------------------------------ */

export const housekeepingRouter = Router();

housekeepingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const { assigneeId } = req.query;

    let tasks = db.tasks.map((task) => ({
      ...task,
      roomNumber: db.rooms.find((room) => room.id === task.roomId)?.number || '—',
      assignee: db.staff.find((member) => member.id === task.assigneeId) || null,
    }));

    if (assigneeId) tasks = tasks.filter((task) => task.assigneeId === assigneeId);

    tasks.sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
        a.due.localeCompare(b.due),
    );

    res.json({ data: tasks });
  }),
);

housekeepingRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const title = String(payload.title || '').trim();
    if (!title) fail('Give the task a short title.', 'VALIDATION_ERROR');
    if (!payload.roomId) fail('Choose a room.', 'VALIDATION_ERROR');

    const db = await loadSnapshot();
    const task = await models.Task.create({
      id: nextId('tsk', db.tasks),
      type: payload.type || 'cleaning',
      title,
      roomId: payload.roomId,
      priority: payload.priority || 'medium',
      status: 'open',
      assigneeId: payload.assigneeId || null,
      due: payload.due || todayISO(),
      description: payload.description || '',
      createdAt: new Date().toISOString(),
    });

    if (task.type === 'cleaning') {
      await models.Bed.updateMany(
        { roomId: task.roomId, maintenance: false, outOfService: false },
        { cleaning: true },
      );
    }

    res.status(201).json({ data: task.toObject() });
  }),
);

housekeepingRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const task = db.tasks.find((item) => item.id === req.params.id);
    if (!task) fail('Task not found.', 'NOT_FOUND', 404);

    const allowed = ['title', 'type', 'roomId', 'priority', 'status', 'assigneeId', 'due', 'description'];
    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)),
    );
    await models.Task.updateOne({ id: task.id }, patch);

    if (patch.status === 'completed' && task.type === 'cleaning') {
      await models.Bed.updateMany(
        { roomId: task.roomId, maintenance: false, outOfService: false },
        { cleaning: false },
      );
    }

    const fresh = await loadSnapshot();
    res.json({ data: fresh.tasks.find((item) => item.id === task.id) });
  }),
);

/* ---------------------------------- Staff --------------------------------- */

export const staffRouter = Router();

staffRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = await loadSnapshot();
    const staff = [...db.staff].sort((a, b) => a.name.localeCompare(b.name));
    res.json({ data: staff });
  }),
);

staffRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    if (!name || !email) fail('Name and email are required.', 'VALIDATION_ERROR');

    const existing = await models.Staff.findOne({ email }).lean();
    if (existing) fail('That email already belongs to a team member.', 'DUPLICATE_MEMBER');

    const db = await loadSnapshot();
    const member = await models.Staff.create({
      id: nextId('stf', db.staff),
      name,
      email,
      passwordHash: await bcrypt.hash(INVITE_PASSWORD, 10),
      role: payload.role || 'receptionist',
      status: 'invited',
      lastActive: null,
      invitedAt: new Date().toISOString(),
    });

    const { passwordHash, ...safe } = member.toObject();
    res.status(201).json({ data: safe });
  }),
);

staffRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const member = await models.Staff.findOne({ id: req.params.id });
    if (!member) fail('Member not found.', 'NOT_FOUND', 404);

    const patch = { ...(req.body || {}) };
    delete patch.passwordHash;
    delete patch.id;
    if (member.role === 'owner' && patch.role && patch.role !== 'owner') {
      fail('The owner role cannot be changed.', 'OWNER_LOCKED');
    }

    Object.assign(member, patch);
    await member.save();
    res.json({ data: member.toObject() });
  }),
);

staffRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const member = await models.Staff.findOne({ id: req.params.id });
    if (!member) fail('Member not found.', 'NOT_FOUND', 404);
    if (member.role === 'owner') fail('The owner account cannot be removed.', 'OWNER_LOCKED');

    await models.Staff.deleteOne({ id: member.id });
    res.json({ data: { id: member.id } });
  }),
);
