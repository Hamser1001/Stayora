import { Router } from 'express';
import { models } from '../db/models.js';
import { nextIdFor } from '../services/snapshot.js';
import { todayISO } from '../lib/dates.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
const TASK_STATUS_VALUES = ['open', 'inProgress', 'completed'];

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
        (a.position ?? 0) - (b.position ?? 0) ||
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

    // New To Do tasks join the bottom of the column, after any manual order.
    const [column] = await models.Task.aggregate([
      { $match: { status: 'open' } },
      {
        $group: {
          _id: null,
          max: { $max: { $ifNull: ['$position', -1] } },
          count: { $sum: 1 },
        },
      },
    ]);
    const position = Math.max((column?.max ?? -1) + 1, column?.count ?? 0);

    const task = await models.Task.create({
      id: await nextIdFor('task', models.Task),
      type: payload.type || 'cleaning',
      title,
      roomId: payload.roomId,
      priority: payload.priority || 'medium',
      status: 'open',
      position,
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

/** Persist a whole drag result: status and column order for affected tasks. */
housekeepingRouter.patch(
  '/reorder',
  requireAuth,
  asyncHandler(async (req, res) => {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (updates.length === 0) fail('No task order was provided.', 'VALIDATION_ERROR');
    if (updates.length > 500) fail('Too many tasks in one reorder.', 'VALIDATION_ERROR');

    const clean = updates.map((update) => {
      const id = String(update?.id || '');
      const status = update?.status;
      const position = Number(update?.position);
      if (!id) fail('A task id is required.', 'VALIDATION_ERROR');
      if (status !== undefined && !TASK_STATUS_VALUES.includes(status)) {
        fail('Choose a valid task status.', 'VALIDATION_ERROR');
      }
      if (!Number.isFinite(position) || position < 0) {
        fail('Task positions must be zero or greater.', 'VALIDATION_ERROR');
      }
      return { id, ...(status ? { status } : {}), position };
    });

    const ids = [...new Set(clean.map((update) => update.id))];
    const existing = await models.Task.find({ id: { $in: ids } }).lean();
    if (existing.length !== ids.length) {
      fail('Some tasks no longer exist. Refresh and try again.', 'NOT_FOUND', 404);
    }
    const before = new Map(existing.map((task) => [task.id, task]));

    await models.Task.bulkWrite(
      clean.map(({ id, status, position }) => ({
        updateOne: {
          filter: { id },
          update: { $set: { position, ...(status ? { status } : {}) } },
        },
      })),
    );

    // Match the single-task move behaviour: finishing a cleaning task frees beds.
    const completed = clean.filter(
      (update) =>
        update.status === 'completed' &&
        before.get(update.id)?.status !== 'completed' &&
        before.get(update.id)?.type === 'cleaning',
    );
    await Promise.all(
      completed.map((update) =>
        models.Bed.updateMany(
          {
            roomId: before.get(update.id).roomId,
            maintenance: false,
            outOfService: false,
          },
          { cleaning: false },
        ),
      ),
    );

    res.json({ data: { updated: clean.length } });
  }),
);

housekeepingRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const task = await models.Task.findOne({ id: req.params.id }).lean();
    if (!task) fail('Task not found.', 'NOT_FOUND', 404);

    const allowed = [
      'title',
      'type',
      'roomId',
      'priority',
      'status',
      'assigneeId',
      'due',
      'description',
      'position',
    ];
    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)),
    );

    // Button moves append to the target column, matching the drag behaviour.
    if (patch.status && patch.status !== task.status) {
      const [column] = await models.Task.aggregate([
        { $match: { status: patch.status } },
        {
          $group: {
            _id: null,
            max: { $max: { $ifNull: ['$position', -1] } },
            count: { $sum: 1 },
          },
        },
      ]);
      patch.position = Math.max((column?.max ?? -1) + 1, column?.count ?? 0);
    }

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
