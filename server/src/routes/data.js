import { Router } from 'express';
import { asyncHandler, fail } from '../middleware/error.js';
import { requirePermission } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { logActivity } from '../services/activity.js';
import {
  buildTemplate,
  buildWorkbook,
  COLLECTION_KEYS,
  COLLECTIONS,
  importCollection,
  readWorkbook,
} from '../services/excel.js';

const router = Router();

router.use(requirePermission('data'));

const accessibleKeys = (member) => COLLECTION_KEYS.filter((key) => can(member, COLLECTIONS[key].module));

router.get(
  '/collections',
  asyncHandler(async (req, res) => {
    const allowed = new Set(accessibleKeys(req.user));
    res.json({
      data: COLLECTION_KEYS.map((key) => {
        const def = COLLECTIONS[key];
        return {
          key,
          label: def.label,
          description: def.description,
          module: def.module,
          columns: def.columns.map((entry) => ({
            key: entry.key,
            header: entry.header,
            required: Boolean(entry.required),
            type: entry.type || 'string',
          })),
          accessible: allowed.has(key),
        };
      }),
    });
  }),
);

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const requested = String(req.query.collections || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const keys = requested.length ? requested : accessibleKeys(req.user);
    if (!keys.length) fail('There is nothing to export for your access level.', 'FORBIDDEN', 403);

    const unknown = keys.filter((key) => !COLLECTIONS[key]);
    if (unknown.length) fail(`Unknown collection: ${unknown.join(', ')}.`, 'UNKNOWN_COLLECTION');

    const blocked = keys.filter((key) => !can(req.user, COLLECTIONS[key].module));
    if (blocked.length) {
      fail(`You do not have access to export: ${blocked.join(', ')}.`, 'FORBIDDEN', 403);
    }

    const buffer = await buildWorkbook(keys);
    await logActivity({
      actor: req.user,
      action: 'data.exported',
      entity: 'data',
      entityId: keys.join(','),
      meta: { collections: keys },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="stayora-export-${stamp}.xlsx"`);
    res.setHeader('X-Export-Collections', keys.join(','));
    res.send(buffer);
  }),
);

router.get(
  '/template',
  asyncHandler(async (req, res) => {
    const key = String(req.query.collection || '');
    const def = COLLECTIONS[key];
    if (!def) fail('Unknown collection.', 'UNKNOWN_COLLECTION', 404);
    if (!can(req.user, def.module)) fail('You do not have access to this collection.', 'FORBIDDEN', 403);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="stayora-${key}-template.xlsx"`);
    res.send(buildTemplate(key));
  }),
);

/** Dry run validates and reports; commit inserts the valid rows. */
router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const { collection, file, dryRun } = req.body || {};
    const def = COLLECTIONS[collection];
    if (!def) fail('Choose a collection to import into.', 'UNKNOWN_COLLECTION');
    if (!can(req.user, def.module)) fail('You do not have access to this collection.', 'FORBIDDEN', 403);

    const base64 = String(file || '').replace(/^data:[^;]+;base64,/, '');
    if (!base64) fail('Choose an Excel file to import.', 'VALIDATION_ERROR');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) fail('The uploaded file is empty.', 'VALIDATION_ERROR');
    if (buffer.length > 8 * 1024 * 1024) fail('Files larger than 8 MB are not supported.', 'FILE_TOO_LARGE', 413);
    // .xlsx files are ZIP archives; legacy .xls uses the OLE compound header.
    const signature = buffer.subarray(0, 4).toString('hex');
    if (signature !== '504b0304' && signature !== 'd0cf11e0') {
      fail('This file is not a valid Excel workbook. Use .xlsx or .xls.', 'INVALID_FILE');
    }

    let matrix;
    try {
      matrix = readWorkbook(buffer, collection);
    } catch (error) {
      if (error.code) throw error;
      fail('This file could not be read as an Excel workbook.', 'INVALID_FILE');
    }

    const result = await importCollection({
      collectionKey: collection,
      matrix,
      dryRun: Boolean(dryRun),
      actor: req.user,
    });

    if (!dryRun) {
      await logActivity({
        actor: req.user,
        action: 'data.import_committed',
        entity: 'data',
        entityId: collection,
        meta: result.summary,
      });
    }

    res.json({ data: result });
  }),
);

export default router;
