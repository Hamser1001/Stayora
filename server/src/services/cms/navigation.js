import { cmsModels } from '../../db/cmsModels.js';
import { ApiError } from '../../middleware/error.js';
import { safeLink, SITE_ID, text, WORKSPACE_KEY } from './scope.js';

/**
 * Header and footer menus.
 *
 * A menu item is either a page reference (resolved to the page's slug at render
 * time, so renaming a slug updates the link) or a custom safe link. Items keep
 * their order in the array; the dashboard reorders them by index.
 */
export const NAV_LOCATIONS = ['header', 'footer'];
const MAX_ITEMS = 12;
const MAX_LABEL = 60;

function randomItemId() {
  return `nav_${Math.random().toString(36).slice(2, 10)}`;
}

function navItemView(item) {
  return {
    id: item.id,
    label: item.label,
    type: item.type,
    pageId: item.pageId || '',
    url: item.url || '',
    visible: item.visible !== false,
    newTab: Boolean(item.newTab),
  };
}

export async function getNavigation(location = null) {
  const filter = { workspaceKey: WORKSPACE_KEY, siteId: SITE_ID };
  if (location) filter.location = location;
  const rows = await cmsModels.CmsNavigation.find(filter).lean();
  const byLocation = new Map(rows.map((row) => [row.location, row.items || []]));
  const shape = (loc) => (byLocation.get(loc) || []).map(navItemView);
  if (location) return shape(location);
  return { header: shape('header'), footer: shape('footer') };
}

export async function saveNavigation(location, items, actor) {
  if (!NAV_LOCATIONS.includes(location)) {
    throw new ApiError('Unknown navigation location.', { code: 'VALIDATION_ERROR', status: 400 });
  }
  const rows = Array.isArray(items) ? items : [];
  if (rows.length > MAX_ITEMS) {
    throw new ApiError(`A menu can hold at most ${MAX_ITEMS} items.`, {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  const normalized = [];
  for (const [index, row] of rows.entries()) {
    const label = text(row?.label, { max: MAX_LABEL, label: `Item ${index + 1} label`, required: true });
    const type = row?.type === 'link' ? 'link' : 'page';
    let pageId = '';
    let url = '';

    if (type === 'page') {
      pageId = text(row?.pageId, { max: 64, label: `Item ${index + 1} page` });
      if (!pageId) {
        throw new ApiError(`Item ${index + 1} needs a page.`, { code: 'VALIDATION_ERROR', status: 400 });
      }
      const page = await cmsModels.CmsPage.findOne({
        id: pageId,
        workspaceKey: WORKSPACE_KEY,
        siteId: SITE_ID,
      }).lean();
      if (!page) {
        throw new ApiError(`Item ${index + 1} points at a page that does not exist.`, {
          code: 'NAV_PAGE_NOT_FOUND',
          status: 400,
        });
      }
    } else {
      url = safeLink(row?.url, { label: `Item ${index + 1} link` });
      if (!url) {
        throw new ApiError(`Item ${index + 1} needs a link.`, { code: 'VALIDATION_ERROR', status: 400 });
      }
    }

    normalized.push({
      id: typeof row?.id === 'string' && /^nav_[a-z0-9]{4,16}$/.test(row.id) ? row.id : randomItemId(),
      label,
      type,
      pageId,
      url,
      visible: row?.visible !== false,
      newTab: Boolean(row?.newTab),
    });
  }

  const now = new Date().toISOString();
  await cmsModels.CmsNavigation.findOneAndUpdate(
    { workspaceKey: WORKSPACE_KEY, siteId: SITE_ID, location },
    {
      $set: {
        items: normalized,
        updatedAt: now,
        updatedBy: actor?.name || '',
      },
      $setOnInsert: { id: `cms_nav_${location}`, location, siteId: SITE_ID },
    },
    { upsert: true },
  );
  await cmsModels.CmsSite.updateOne({ workspaceKey: WORKSPACE_KEY }, { $set: { updatedAt: now } });

  return getNavigation(location);
}
