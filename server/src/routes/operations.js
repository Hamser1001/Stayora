import { Router } from 'express';
import { models } from '../db/models.js';
import { nextIdFor } from '../services/snapshot.js';
import { todayISO } from '../lib/dates.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

/* ------------------------------ Housekeeping ------------------------------ */

export const housekeepingRouter = Router();

housekeepingRouter.use(requirePermission('housekeeping'));

housekeepingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { assigneeId } = req.query;
    const [tasks, rooms, staff] = await Promise.all([
      models.Task.find(assigneeId ? { assigneeId: String(assigneeId) } : {}).lean(),
      models.Room.find({}, { id: 1, number: 1, _id: 0 }).lean(),
      models.Staff.find().lean(),
    ]);
    const roomMap = new Map(rooms.map((room) => [room.id, room.number]));
    const staffMap = new Map(staff.map((member) => [member.id, member]));

    const data = tasks.map((task) => ({
      ...task,
      roomNumber: roomMap.get(task.roomId) || '—',
      assignee: staffMap.get(task.assigneeId) || null,
    }));

    data.sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
        a.due.localeCompare(b.due),
    );

    res.json({ data });
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

    const task = await models.Task.create({
      id: await nextIdFor('task', models.Task),
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
    const task = await models.Task.findOne({ id: req.params.id }).lean();
    if (!task) fail('Task not found.', 'NOT_FOUND', 404);

    const allowed = ['title', 'type', 'roomId', 'priority', 'status', 'assigneeId', 'due', 'description'];
    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)),
    );
    await models.Task.updateOne({ id: task.id }, patch);

    if (patch.status === 'completed' && (patch.type || task.type) === 'cleaning') {
      await models.Bed.updateMany(
        { roomId: patch.roomId || task.roomId, maintenance: false, outOfService: false },
        { cleaning: false },
      );
    }

    const fresh = await models.Task.findOne({ id: task.id }).lean();
    res.json({ data: fresh });
  }),
);
