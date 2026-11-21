import { cmsModels } from '../../db/cmsModels.js';
import { ApiError } from '../../middleware/error.js';
import { nextIdFor } from '../snapshot.js';
import { assertMedia } from './media.js';
import {
  assertSlug,
  isDuplicateKey,
  option,
  SITE_ID,
  SYSTEM_PAGE_KEYS,
  text,
  WORKSPACE_KEY,
} from './scope.js';
import { mediaIdsForSection, sectionType, validateSection } from './sections.js';

/**
 * Page and section management.
 *
 * Editing happens on the draft rows. Publishing copies the visible sections
 * into `page.published`, an immutable snapshot the public API reads. That is
 * why a draft edit never leaks and why a live page keeps rendering the last
 * published revision while the next one is being prepared.
 */

const MAX_SECTIONS = 40;
const MAX_PAGES = 200;

function fail(message, code, status = 400, details = null) {
  throw new ApiError(message, { code, status, details });
}

function seoView(seo) {
  return {
    title: seo?.title || '',
    description: seo?.description || '',
    canonicalUrl: seo?.canonicalUrl || '',
    ogImageMediaId: seo?.ogImageMediaId || '',
    noIndex: Boolean(seo?.noIndex),
  };
}

export function pageView(page, { sections = null } = {}) {
  const view = {
    id: page.id,
    title: page.title,
    slug: page.slug,
    description: page.description || '',
    status: page.status,
    visibility: page.visibility || 'public',
    systemKey: page.systemKey || null,
    order: page.order || 0,
    seo: seoView(page.seo),
    revision: page.revision || 0,
    publishedAt: page.publishedAt || null,
    publishedBy: page.publishedBy || '',
    hasUnpublishedChanges: Boolean(page.status === 'published' && page.updatedAt && page.updatedAt > (page.publishedAt || '')),
    createdAt: page.createdAt || null,
    updatedAt: page.updatedAt || null,
    updatedBy: page.updatedBy || '',
  };
  if (sections) {
    view.sections = sections.map((section) => sectionView(section));
  }
  return view;
}

export function sectionView(section) {
  return {
    id: section.id,
    pageId: section.pageId,
    type: section.type,
    variant: section.variant || '',
    order: section.order || 0,
    visible: section.visible !== false,
    contentVersion: section.contentVersion || 1,
    content: section.content || {},
    updatedAt: section.updatedAt || null,
    updatedBy: section.updatedBy || '',
  };
}

async function assertPage(id) {
  const page = await cmsModels.CmsPage.findOne({
    id: String(id || ''),
    workspaceKey: WORKSPACE_KEY,
    siteId: SITE_ID,
  }).lean();
  if (!page) fail('Page not found.', 'PAGE_NOT_FOUND', 404);
  return page;
}

async function assertSection(id) {
  const section = await cmsModels.CmsSection.findOne({
    id: String(id || ''),
    workspaceKey: WORKSPACE_KEY,
    siteId: SITE_ID,
  }).lean();
  if (!section) fail('Section not found.', 'SECTION_NOT_FOUND', 404);
  return section;
}

async function normalizePageSeo(input, current, siteId) {
  const source = { ...(current || {}), ...(input || {}) };
  const canonicalUrl = text(source.canonicalUrl, { max: 300, label: 'Canonical URL' });
  if (canonicalUrl && !/^https:\/\/[^\s]+$/i.test(canonicalUrl)) {
    fail('Canonical URL must be an https:// address.', 'VALIDATION_ERROR');
  }
  const ogImageMediaId = text(source.ogImageMediaId, { max: 64, label: 'Social image' });
  if (ogImageMediaId) await assertMedia(ogImageMediaId, siteId, { label: 'Social image' });
  return {
    title: text(source.title, { max: 70, label: 'SEO title' }),
    description: text(source.description, { max: 180, label: 'Meta description' }),
    canonicalUrl,
    ogImageMediaId,
    noIndex: Boolean(source.noIndex),
  };
}

async function assertMediaInContent(siteId, section) {
  const ids = mediaIdsForSection(section);
  for (const mediaId of ids) {
    await assertMedia(mediaId, siteId);
  }
}

export async function listPages() {
  const pages = await cmsModels.CmsPage.find({ workspaceKey: WORKSPACE_KEY, siteId: SITE_ID })
    .sort({ order: 1, title: 1 })
    .lean();
  const counts = await cmsModels.CmsSection.aggregate([
    { $match: { workspaceKey: WORKSPACE_KEY, siteId: SITE_ID } },
    {
      $group: {
        _id: '$pageId',
        total: { $sum: 1 },
        visible: { $sum: { $cond: [{ $eq: ['$visible', false] }, 0, 1] } },
      },
    },
  ]);
  const byPage = new Map(counts.map((row) => [row._id, row]));
  return pages.map((page) => ({
    ...pageView(page),
    sectionCount: byPage.get(page.id)?.total || 0,
    visibleSectionCount: byPage.get(page.id)?.visible || 0,
  }));
}

export async function getPage(id) {
  const page = await assertPage(id);
  const sections = await cmsModels.CmsSection.find({
    pageId: page.id,
    workspaceKey: WORKSPACE_KEY,
    siteId: SITE_ID,
  })
    .sort({ order: 1, id: 1 })
    .lean();
  return pageView(page, { sections });
}

export async function createPage(input, { siteId, actor } = {}) {
  const total = await cmsModels.CmsPage.countDocuments({ workspaceKey: WORKSPACE_KEY, siteId: SITE_ID });
  if (total >= MAX_PAGES) fail('This workspace has reached its page limit.', 'PAGE_LIMIT_REACHED', 409);

  const title = text(input?.title, { max: 120, label: 'Page title', required: true });
  const slug = assertSlug(input?.slug || title, { label: 'Page slug' });
  const systemKey = input?.systemKey ? option(input.systemKey, SYSTEM_PAGE_KEYS, { label: 'Page type' }) : null;
  if (systemKey === 'home') {
    const existing = await cmsModels.CmsPage.findOne({ workspaceKey: WORKSPACE_KEY, siteId: SITE_ID, systemKey: 'home' }).lean();
    if (existing) fail('This workspace already has a home page.', 'HOME_PAGE_EXISTS', 409);
  }

  const last = await cmsModels.CmsPage.findOne({ workspaceKey: WORKSPACE_KEY, siteId: SITE_ID })
    .sort({ order: -1 })
    .lean();
  const now = new Date().toISOString();

  try {
    const page = await cmsModels.CmsPage.create({
      id: await nextIdFor('page', cmsModels.CmsPage),
      workspaceKey: WORKSPACE_KEY,
      siteId,
      title,
      slug,
      description: text(input?.description, { max: 300, label: 'Page description' }),
      status: 'draft',
      visibility: option(input?.visibility, ['public', 'unlisted'], {
        label: 'Visibility',
        fallback: 'public',
      }),
      systemKey,
      order: (last?.order ?? -1) + 1,
      seo: await normalizePageSeo(input?.seo, {}, siteId),
      revision: 0,
      published: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor?.name || '',
      updatedBy: actor?.name || '',
    });
    return pageView(page.toObject());
  } catch (error) {
    if (isDuplicateKey(error)) fail('That page slug is already in use.', 'SLUG_TAKEN', 409);
    throw error;
  }
}

export async function updatePage(id, input, { siteId, actor } = {}) {
  const page = await assertPage(id);
  const set = { updatedAt: new Date().toISOString(), updatedBy: actor?.name || '' };

  if (input?.title !== undefined) set.title = text(input.title, { max: 120, label: 'Page title', required: true });
  if (input?.slug !== undefined) set.slug = assertSlug(input.slug, { label: 'Page slug' });
  if (input?.description !== undefined) {
    set.description = text(input.description, { max: 300, label: 'Page description' });
  }
  if (input?.visibility !== undefined) {
    set.visibility = option(input.visibility, ['public', 'unlisted'], { label: 'Visibility' });
  }
  if (input?.order !== undefined) {
    const order = Number(input.order);
    if (!Number.isFinite(order) || order < 0 || order > MAX_PAGES) {
      fail('Page order is not valid.', 'VALIDATION_ERROR');
    }
    set.order = Math.round(order);
  }
  if (input?.seo !== undefined) set.seo = await normalizePageSeo(input.seo, page.seo, siteId);

  try {
    const updated = await cmsModels.CmsPage.findOneAndUpdate(
      { id: page.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID },
      { $set: set },
      { new: true, lean: true },
    );
    return pageView(updated);
  } catch (error) {
    if (isDuplicateKey(error)) fail('That page slug is already in use.', 'SLUG_TAKEN', 409);
    throw error;
  }
}

export async function deletePage(id) {
  const page = await assertPage(id);
  if (page.systemKey === 'home') {
    fail('The home page cannot be deleted. Rename it or unpublish it instead.', 'HOME_PAGE_REQUIRED', 409);
  }
  await cmsModels.CmsSection.deleteMany({ pageId: page.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID });
  await cmsModels.CmsPage.deleteOne({ id: page.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID });
  return { id: page.id, deleted: true };
}

export async function reorderPages(items) {
  const rows = Array.isArray(items) ? items.slice(0, MAX_PAGES) : [];
  if (!rows.length) fail('Nothing to reorder.', 'VALIDATION_ERROR');
  const now = new Date().toISOString();
  await Promise.all(
    rows
      .filter((row) => row && row.id)
      .map((row, index) =>
        cmsModels.CmsPage.updateOne(
          { id: String(row.id), workspaceKey: WORKSPACE_KEY, siteId: SITE_ID },
          { $set: { order: Number.isFinite(Number(row.order)) ? Number(row.order) : index, updatedAt: now } },
        ),
      ),
  );
  return listPages();
}

export async function listSections(pageId) {
  const page = await assertPage(pageId);
  const sections = await cmsModels.CmsSection.find({
    pageId: page.id,
    workspaceKey: WORKSPACE_KEY,
    siteId: SITE_ID,
  })
    .sort({ order: 1, id: 1 })
    .lean();
  return sections.map((section) => sectionView(section));
}

export async function createSection(pageId, input, { siteId, actor } = {}) {
  const page = await assertPage(pageId);
  const total = await cmsModels.CmsSection.countDocuments({
    pageId: page.id,
    workspaceKey: WORKSPACE_KEY,
    siteId: SITE_ID,
  });
  if (total >= MAX_SECTIONS) fail('This page has reached its section limit.', 'SECTION_LIMIT_REACHED', 409);

  const normalized = validateSection({ type: input?.type, variant: input?.variant, content: input?.content }, { fail });
  await assertMediaInContent(siteId, normalized);

  const last = await cmsModels.CmsSection.findOne({
    pageId: page.id,
    workspaceKey: WORKSPACE_KEY,
    siteId: SITE_ID,
  })
    .sort({ order: -1 })
    .lean();
  const now = new Date().toISOString();

  const section = await cmsModels.CmsSection.create({
    id: await nextIdFor('section', cmsModels.CmsSection),
    workspaceKey: WORKSPACE_KEY,
    siteId,
    pageId: page.id,
    type: normalized.type,
    variant: normalized.variant,
    order: (last?.order ?? -1) + 1,
    visible: input?.visible !== false,
    contentVersion: normalized.contentVersion,
    content: normalized.content,
    createdAt: now,
    updatedAt: now,
    createdBy: actor?.name || '',
    updatedBy: actor?.name || '',
  });

  return sectionView(section.toObject());
}

export async function updateSection(id, input, { siteId, actor } = {}) {
  const section = await assertSection(id);
  if (input?.type !== undefined && input.type !== section.type) {
    fail('A section cannot change its type. Create a new section instead.', 'SECTION_TYPE_IMMUTABLE', 409);
  }

  const set = { updatedAt: new Date().toISOString(), updatedBy: actor?.name || '' };
  if (input?.content !== undefined) {
    const merged = { ...(section.content || {}), ...(input.content || {}) };
    const normalized = validateSection(
      { type: section.type, variant: section.variant, content: merged },
      { fail },
    );
    await assertMediaInContent(siteId, normalized);
    set.content = normalized.content;
    set.contentVersion = normalized.contentVersion;
  }
  if (input?.variant !== undefined) {
    const normalized = validateSection(
      { type: section.type, variant: input.variant, content: set.content || section.content || {} },
      { fail },
    );
    set.variant = normalized.variant;
  }
  if (input?.visible !== undefined) set.visible = Boolean(input.visible);
  if (input?.order !== undefined) {
    const order = Number(input.order);
    if (!Number.isFinite(order) || order < 0 || order > MAX_SECTIONS * 10) {
      fail('Section order is not valid.', 'VALIDATION_ERROR');
    }
    set.order = Math.round(order);
  }

  const updated = await cmsModels.CmsSection.findOneAndUpdate(
    { id: section.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID },
    { $set: set },
    { new: true, lean: true },
  );
  return sectionView(updated);
}

export async function deleteSection(id) {
  const section = await assertSection(id);
  await cmsModels.CmsSection.deleteOne({ id: section.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID });
  return { id: section.id, deleted: true };
}

export async function reorderSections(pageId, items) {
  const page = await assertPage(pageId);
  const rows = Array.isArray(items) ? items.slice(0, MAX_SECTIONS) : [];
  if (!rows.length) fail('Nothing to reorder.', 'VALIDATION_ERROR');
  const now = new Date().toISOString();
  await Promise.all(
    rows
      .filter((row) => row && row.id)
      .map((row, index) =>
        cmsModels.CmsSection.updateOne(
          { id: String(row.id), pageId: page.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID },
          { $set: { order: Number.isFinite(Number(row.order)) ? Number(row.order) : index, updatedAt: now } },
        ),
      ),
  );
  return listSections(page.id);
}

/**
 * Publishing re-validates every visible section against the current registry,
 * requires referenced images to be public, then freezes the payload.
 */
export async function publishPage(id, actor) {
  const page = await assertPage(id);
  const site = await cmsModels.CmsSite.findOne({ workspaceKey: WORKSPACE_KEY }).lean();
  if (!site) fail('Set up the website before publishing a page.', 'SITE_MISSING', 409);

  const sections = await cmsModels.CmsSection.find({
    pageId: page.id,
    workspaceKey: WORKSPACE_KEY,
    siteId: SITE_ID,
  })
    .sort({ order: 1, id: 1 })
    .lean();
  const visible = sections.filter((section) => section.visible !== false);

  if (!visible.length) fail('Add at least one visible section before publishing.', 'PAGE_EMPTY', 409);

  const snapshotSections = [];
  const privateMedia = new Set();
  for (const section of visible) {
    // Registry fields may have changed since the draft was written.
    const normalized = validateSection(
      { type: section.type, variant: section.variant, content: section.content },
      { fail },
    );
    if (!sectionType(section.type)) fail('Unsupported section type.', 'UNKNOWN_SECTION_TYPE');
    for (const mediaId of mediaIdsForSection(normalized)) {
      const media = await assertMedia(mediaId, site.id);
      if (media.visibility !== 'public') privateMedia.add(mediaId);
    }
    snapshotSections.push({
      type: normalized.type,
      variant: normalized.variant,
      content: normalized.content,
      contentVersion: normalized.contentVersion,
    });
  }

  if (privateMedia.size) {
    fail('Make the images used by this page public before publishing it.', 'MEDIA_NOT_PUBLIC', 409, {
      mediaIds: [...privateMedia],
    });
  }

  const now = new Date().toISOString();
  const revision = (page.revision || 0) + 1;
  const updated = await cmsModels.CmsPage.findOneAndUpdate(
    { id: page.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID },
    {
      $set: {
        status: 'published',
        publishedAt: now,
        publishedBy: actor?.name || '',
        updatedAt: now,
        revision,
        seo: seoView(page.seo),
        published: {
          revision,
          title: page.title,
          slug: page.slug,
          description: page.description || '',
          visibility: page.visibility || 'public',
          seo: seoView(page.seo),
          sections: snapshotSections,
          publishedAt: now,
        },
      },
    },
    { new: true, lean: true },
  );
  return pageView(updated);
}

export async function unpublishPage(id) {
  const page = await assertPage(id);
  if (page.systemKey === 'home') {
    fail('The home page stays published while the website is live. Unpublish the website instead.', 'HOME_PAGE_REQUIRED', 409);
  }
  const now = new Date().toISOString();
  const updated = await cmsModels.CmsPage.findOneAndUpdate(
    { id: page.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID },
    { $set: { status: 'draft', published: null, publishedAt: null, updatedAt: now } },
    { new: true, lean: true },
  );
  return pageView(updated);
}

export async function pageStats() {
  const [total, published, draft, media] = await Promise.all([
    cmsModels.CmsPage.countDocuments({ workspaceKey: WORKSPACE_KEY, siteId: SITE_ID }),
    cmsModels.CmsPage.countDocuments({ workspaceKey: WORKSPACE_KEY, siteId: SITE_ID, status: 'published' }),
    cmsModels.CmsPage.countDocuments({ workspaceKey: WORKSPACE_KEY, siteId: SITE_ID, status: 'draft' }),
    cmsModels.CmsMedia.countDocuments({ workspaceKey: WORKSPACE_KEY, siteId: SITE_ID }),
  ]);
  return { pages: total, published, draft, media };
}
