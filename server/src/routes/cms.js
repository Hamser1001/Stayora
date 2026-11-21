import { Router } from 'express';
import { asyncHandler, ApiError, fail } from '../middleware/error.js';
import { requirePermission } from '../middleware/auth.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { logActivity } from '../services/activity.js';
import { ensureSite, publishSite, siteView, unpublishSite, updateSite } from '../services/cms/site.js';
import {
  createPage,
  createSection,
  deletePage,
  deleteSection,
  getPage,
  listPages,
  listSections,
  pageStats,
  publishPage,
  reorderPages,
  reorderSections,
  unpublishPage,
  updatePage,
  updateSection,
} from '../services/cms/content.js';
import {
  createMedia,
  deleteMedia,
  listMedia,
  mediaBuffer,
  mediaFolders,
  mediaView,
  replaceMedia,
  updateMedia,
} from '../services/cms/media.js';
import { getNavigation, NAV_LOCATIONS, saveNavigation } from '../services/cms/navigation.js';
import { sectionCatalog } from '../services/cms/sections.js';
import { mediaStorageName } from '../services/cms/mediaStorage.js';
import { WORKSPACE_KEY } from '../services/cms/scope.js';

/**
 * CMS management API
 * ------------------
 * Every route is authenticated and gated by the `cms` module, and every write
 * is limited to owners and managers — exactly like the rest of the dashboard's
 * privileged settings. The workspace and site are resolved on the server; no
 * route reads an account or site id from the request, which is what makes
 * cross-workspace access impossible rather than merely unlikely.
 *
 * Authentication is a bearer token (never a cookie), so there is no ambient
 * credential to ride with a cross-site request.
 */
const router = Router();

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // base64 of a 5 MB image
const readLimiter = createRateLimiter({ windowMs: 60000, max: 240, scope: 'cms:read' });
const writeLimiter = createRateLimiter({ windowMs: 60000, max: 90, scope: 'cms:write' });
const uploadLimiter = createRateLimiter({ windowMs: 60000, max: 20, scope: 'cms:upload' });

function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

function limitUpload(req, res, next) {
  const declared = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return next(new ApiError('Images must be 5 MB or smaller.', { code: 'FILE_TOO_LARGE', status: 413 }));
  }
  return next();
}

/** Owners and managers may edit the website; nobody else may write. */
function requireEditor(req, res, next) {
  if (!req.user) {
    return next(new ApiError('Your session has expired. Please sign in again.', {
      code: 'UNAUTHENTICATED',
      status: 401,
    }));
  }
  if (!['owner', 'manager'].includes(req.user.role)) {
    return next(new ApiError('Only owners and managers can edit the website.', {
      code: 'FORBIDDEN',
      status: 403,
    }));
  }
  return next();
}

router.use(requirePermission('cms'));
router.use(noStore);

async function siteForRequest() {
  return ensureSite();
}

function mustBeObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail('Invalid request body.', 'VALIDATION_ERROR');
  }
  return body;
}

function audit(req, action, entity, entityId, meta = {}) {
  return logActivity({ actor: req.user, action, entity, entityId, meta });
}

/* --------------------------------- Overview -------------------------------- */

router.get(
  '/',
  readLimiter,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    const [stats, navigation, folders] = await Promise.all([
      pageStats(),
      getNavigation(),
      mediaFolders(),
    ]);
    res.json({
      data: {
        site: siteView(site),
        stats,
        navigation,
        mediaFolders: folders,
        storage: { driver: mediaStorageName() },
        canManage: ['owner', 'manager'].includes(req.user.role),
      },
    });
  }),
);

router.get('/section-types', readLimiter, (req, res) => {
  res.json({ data: sectionCatalog() });
});

/* ----------------------------------- Site ---------------------------------- */

router.get(
  '/site',
  readLimiter,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    res.json({ data: siteView(site) });
  }),
);

router.patch(
  '/site',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    const body = mustBeObject(req.body);
    const updated = await updateSite(body, req.user);
    const changed = Object.keys(body).filter((key) => key !== 'status');
    await audit(req, 'cms.branding_updated', 'cms_site', site.id, { sections: changed });
    res.json({ data: updated });
  }),
);

router.post(
  '/site/publish',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    const updated = await publishSite(req.user);
    await audit(req, 'cms.site_published', 'cms_site', site.id);
    res.json({ data: updated });
  }),
);

router.post(
  '/site/unpublish',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    const updated = await unpublishSite(req.user);
    await audit(req, 'cms.site_unpublished', 'cms_site', site.id);
    res.json({ data: updated });
  }),
);

/* ----------------------------------- Pages --------------------------------- */

router.get(
  '/pages',
  readLimiter,
  asyncHandler(async (req, res) => {
    await siteForRequest();
    res.json({ data: await listPages() });
  }),
);

router.post(
  '/pages',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    const body = mustBeObject(req.body);
    const page = await createPage(body, { siteId: site.id, actor: req.user });
    await audit(req, 'cms.page_created', 'cms_page', page.id, { slug: page.slug });
    res.status(201).json({ data: page });
  }),
);

router.post(
  '/pages/reorder',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const body = mustBeObject(req.body);
    const pages = await reorderPages(body.items);
    await audit(req, 'cms.pages_reordered', 'cms_page', null, { count: pages.length });
    res.json({ data: pages });
  }),
);

router.get(
  '/pages/:id',
  readLimiter,
  asyncHandler(async (req, res) => {
    await siteForRequest();
    res.json({ data: await getPage(req.params.id) });
  }),
);

router.patch(
  '/pages/:id',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    const body = mustBeObject(req.body);
    const page = await updatePage(req.params.id, body, { siteId: site.id, actor: req.user });
    await audit(req, 'cms.page_updated', 'cms_page', page.id, { fields: Object.keys(body) });
    res.json({ data: page });
  }),
);

router.delete(
  '/pages/:id',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const page = await deletePage(req.params.id);
    await audit(req, 'cms.page_deleted', 'cms_page', page.id);
    res.json({ data: page });
  }),
);

router.post(
  '/pages/:id/publish',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const page = await publishPage(req.params.id, req.user);
    await audit(req, 'cms.page_published', 'cms_page', page.id, { revision: page.revision });
    res.json({ data: page });
  }),
);

router.post(
  '/pages/:id/unpublish',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const page = await unpublishPage(req.params.id);
    await audit(req, 'cms.page_unpublished', 'cms_page', page.id);
    res.json({ data: page });
  }),
);

/* -------------------------------- Sections --------------------------------- */

router.get(
  '/pages/:id/sections',
  readLimiter,
  asyncHandler(async (req, res) => {
    res.json({ data: await listSections(req.params.id) });
  }),
);

router.post(
  '/pages/:id/sections',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    const body = mustBeObject(req.body);
    const section = await createSection(req.params.id, body, { siteId: site.id, actor: req.user });
    await audit(req, 'cms.section_created', 'cms_section', section.id, { type: section.type });
    res.status(201).json({ data: section });
  }),
);

router.post(
  '/pages/:id/sections/reorder',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const body = mustBeObject(req.body);
    const sections = await reorderSections(req.params.id, body.items);
    await audit(req, 'cms.sections_reordered', 'cms_section', req.params.id, { count: sections.length });
    res.json({ data: sections });
  }),
);

router.patch(
  '/sections/:id',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    const body = mustBeObject(req.body);
    const section = await updateSection(req.params.id, body, { siteId: site.id, actor: req.user });
    await audit(req, 'cms.section_updated', 'cms_section', section.id, { fields: Object.keys(body) });
    res.json({ data: section });
  }),
);

router.delete(
  '/sections/:id',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const section = await deleteSection(req.params.id);
    await audit(req, 'cms.section_deleted', 'cms_section', section.id);
    res.json({ data: section });
  }),
);

/* ----------------------------------- Media --------------------------------- */

router.get(
  '/media',
  readLimiter,
  asyncHandler(async (req, res) => {
    await siteForRequest();
    res.json({
      data: await listMedia({ q: req.query.q, folder: req.query.folder, limit: req.query.limit }),
      meta: { folders: await mediaFolders(), driver: mediaStorageName() },
    });
  }),
);

router.post(
  '/media',
  uploadLimiter,
  limitUpload,
  requireEditor,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    const body = mustBeObject(req.body);
    const media = await createMedia({ ...body, siteId: site.id }, req.user);
    await audit(req, 'cms.media_uploaded', 'cms_media', media.id, { bytes: media.size, mime: media.mimeType });
    res.status(201).json({ data: media });
  }),
);

router.patch(
  '/media/:id',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const body = mustBeObject(req.body);
    const media = await updateMedia(req.params.id, body, req.user);
    await audit(req, 'cms.media_updated', 'cms_media', media.id, { fields: Object.keys(body) });
    res.json({ data: media });
  }),
);

router.post(
  '/media/:id/replace',
  uploadLimiter,
  limitUpload,
  requireEditor,
  asyncHandler(async (req, res) => {
    const body = mustBeObject(req.body);
    const media = await replaceMedia(req.params.id, body, req.user);
    await audit(req, 'cms.media_replaced', 'cms_media', media.id, { bytes: media.size });
    res.json({ data: media });
  }),
);

router.delete(
  '/media/:id',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const media = await deleteMedia(req.params.id);
    await audit(req, 'cms.media_deleted', 'cms_media', media.id);
    res.json({ data: media });
  }),
);

/** Dashboard preview. Unpublished binaries stay behind authentication. */
router.get(
  '/media/:id/file',
  readLimiter,
  asyncHandler(async (req, res) => {
    const { media, buffer } = await mediaBuffer(req.params.id);
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (media.hash) res.setHeader('ETag', `"${media.hash.slice(0, 32)}"`);
    res.send(buffer);
  }),
);

/* -------------------------------- Navigation ------------------------------- */

router.get(
  '/navigation',
  readLimiter,
  asyncHandler(async (req, res) => {
    await siteForRequest();
    res.json({ data: await getNavigation() });
  }),
);

router.put(
  '/navigation/:location',
  writeLimiter,
  requireEditor,
  asyncHandler(async (req, res) => {
    const location = String(req.params.location || '');
    if (!NAV_LOCATIONS.includes(location)) fail('Unknown navigation location.', 'NOT_FOUND', 404);
    const body = mustBeObject(req.body);
    const items = await saveNavigation(location, body.items, req.user);
    await audit(req, 'cms.navigation_updated', 'cms_navigation', location, { count: items.length });
    res.json({ data: items });
  }),
);

/* ----------------------------------- Meta ---------------------------------- */

router.get(
  '/meta',
  readLimiter,
  asyncHandler(async (req, res) => {
    const site = await siteForRequest();
    res.json({
      data: {
        workspace: WORKSPACE_KEY,
        site: siteView(site),
        sectionTypes: sectionCatalog(),
        navigationLocations: NAV_LOCATIONS,
        storage: { driver: mediaStorageName() },
        canManage: ['owner', 'manager'].includes(req.user.role),
      },
    });
  }),
);

export default router;
