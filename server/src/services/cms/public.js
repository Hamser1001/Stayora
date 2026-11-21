import { cmsModels } from '../../db/cmsModels.js';
import { models } from '../../db/models.js';
import { ApiError } from '../../middleware/error.js';
import { WORKSPACE_KEY } from './scope.js';

/**
 * Public website surface
 * ----------------------
 * Read-only, unauthenticated and deliberately narrow: a site must be published,
 * a page must be published, and only `page.published` snapshots are serialised.
 * Drafts, workspace internals, editor identities, page ids and media ids that
 * are not public never leave this boundary.
 *
 * Operational data (availability, rates, reservations) is not served here; the
 * website will call the core reservation API for that. This module never
 * duplicates inventory or pricing.
 */
function notFound() {
  throw new ApiError('Not found.', { code: 'NOT_FOUND', status: 404 });
}

async function publishedSite(slug) {
  const site = await cmsModels.CmsSite.findOne({ workspaceKey: WORKSPACE_KEY, slug: String(slug || '') }).lean();
  if (!site || site.status !== 'published') notFound();
  return site;
}

async function mediaRefs(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await cmsModels.CmsMedia.find({
    workspaceKey: WORKSPACE_KEY,
    id: { $in: unique },
    visibility: 'public',
  }).lean();
  return new Map(
    rows.map((media) => [
      media.id,
      {
        url: `/api/public/media/${media.id}`,
        alt: media.alt || '',
        width: media.width || 0,
        height: media.height || 0,
      },
    ]),
  );
}

function collectIds(value, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectIds(entry, out));
    return out;
  }
  for (const entry of Object.values(value)) {
    if (typeof entry === 'string' && /^med_[0-9]+$/.test(entry)) out.add(entry);
    else collectIds(entry, out);
  }
  return out;
}

function publicSeo(seo, media) {
  return {
    title: seo?.title || '',
    description: seo?.description || '',
    canonicalUrl: seo?.canonicalUrl || '',
    noIndex: Boolean(seo?.noIndex),
    ogImage: seo?.ogImageMediaId ? media.get(seo.ogImageMediaId) || null : null,
  };
}

/** Menus resolved against published pages only, so no draft link leaks. */
async function publicMenus(siteId) {
  const [rows, pages] = await Promise.all([
    cmsModels.CmsNavigation.find({ siteId }).lean(),
    cmsModels.CmsPage.find({ siteId, status: 'published', visibility: 'public' }, { id: 1, slug: 1 }).lean(),
  ]);
  const byId = new Map(pages.map((page) => [page.id, page]));
  const menus = { header: [], footer: [] };
  for (const row of rows) {
    if (!menus[row.location]) continue;
    for (const item of row.items || []) {
      if (item.visible === false) continue;
      if (item.type === 'page') {
        const target = byId.get(item.pageId);
        if (!target) continue;
        menus[row.location].push({ label: item.label, href: `/${target.slug}`, newTab: Boolean(item.newTab) });
      } else {
        menus[row.location].push({ label: item.label, href: item.url, newTab: Boolean(item.newTab) });
      }
    }
  }
  return menus;
}

/** Site configuration, navigation and the index of published pages. */
export async function publicSite(slug) {
  const site = await publishedSite(slug);
  const pages = await cmsModels.CmsPage.find({ siteId: site.id, status: 'published', visibility: 'public' })
    .sort({ order: 1, title: 1 })
    .lean();

  const branding = site.branding || {};
  const media = await mediaRefs([branding.logoMediaId, branding.faviconMediaId, site.seo?.ogImageMediaId]);

  const menus = await publicMenus(site.id);

  return {
    site: {
      slug: site.slug,
      name: site.name,
      tagline: site.tagline || '',
      description: site.description || '',
      locale: site.locale || 'en',
      publishedAt: site.publishedAt || null,
    },
    branding: {
      logo: branding.logoMediaId ? media.get(branding.logoMediaId) || null : null,
      favicon: branding.faviconMediaId ? media.get(branding.faviconMediaId) || null : null,
      primaryColor: branding.primaryColor || '#111827',
      secondaryColor: branding.secondaryColor || '#f5f5f4',
      accentColor: branding.accentColor || '#0f766e',
      headingFont: branding.headingFont || 'display',
      bodyFont: branding.bodyFont || 'inter',
      radius: branding.radius ?? 12,
    },
    contact: {
      email: site.contact?.email || '',
      phone: site.contact?.phone || '',
      address: site.contact?.address || '',
      city: site.contact?.city || '',
      country: site.contact?.country || '',
      instagram: site.contact?.instagram || '',
      facebook: site.contact?.facebook || '',
    },
    seo: publicSeo(site.seo, media),
    navigation: menus,
    pages: pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      description: page.description || '',
      systemKey: page.systemKey || null,
      order: page.order || 0,
      updatedAt: page.publishedAt || null,
    })),
  };
}

/** One published page: snapshot sections plus the public image map. */
export async function publicPage(siteSlug, pageSlug) {
  const site = await publishedSite(siteSlug);
  const page = await cmsModels.CmsPage.findOne({
    siteId: site.id,
    slug: String(pageSlug || ''),
    status: 'published',
  }).lean();
  if (!page || !page.published) notFound();

  const snapshot = page.published;
  const mediaIds = collectIds(snapshot.sections || []);
  const media = await mediaRefs([...mediaIds]);
  const seo = snapshot.seo || {};
  if (seo.ogImageMediaId) {
    const og = await mediaRefs([seo.ogImageMediaId]);
    for (const [key, value] of og) media.set(key, value);
  }

  return {
    site: { slug: site.slug, name: site.name, locale: site.locale || 'en' },
    page: {
      slug: snapshot.slug,
      title: snapshot.title,
      description: snapshot.description || '',
      revision: snapshot.revision || 0,
      publishedAt: snapshot.publishedAt || page.publishedAt || null,
      visibility: snapshot.visibility || 'public',
      seo: publicSeo(seo, media),
    },
    navigation: await publicMenus(site.id),
    sections: (snapshot.sections || []).map((section, index) => ({
      id: `${snapshot.revision || 0}-${index}`,
      type: section.type,
      variant: section.variant || '',
      content: section.content || {},
    })),
    media: Object.fromEntries(media),
  };
}

/** Media bytes are served only for images that are explicitly public. */
export async function publicMedia(id) {
  const media = await cmsModels.CmsMedia.findOne({
    workspaceKey: WORKSPACE_KEY,
    id: String(id || ''),
    visibility: 'public',
  }).lean();
  if (!media) notFound();
  const site = await cmsModels.CmsSite.findOne({ workspaceKey: WORKSPACE_KEY }, { status: 1 }).lean();
  if (!site || site.status !== 'published') notFound();
  return media;
}

/**
 * Room inventory is Core data. This read-only projection exists so the future
 * website never needs database access; it exposes no guest, payment or
 * reservation information, and no availability (that stays in the reservation
 * API, which owns the date rules).
 */
export async function publicRooms(siteSlug) {
  const site = await publishedSite(siteSlug);
  const [rooms, beds] = await Promise.all([
    models.Room.find({}, { _id: 0, id: 1, number: 1, type: 1, audience: 1, floor: 1, amenities: 1, pricePerBed: 1 }).lean(),
    models.Bed.find({ outOfService: false }, { _id: 0, roomId: 1, label: 1 }).lean(),
  ]);
  const byRoom = new Map();
  for (const bed of beds) {
    const list = byRoom.get(bed.roomId) || [];
    list.push(bed.label);
    byRoom.set(bed.roomId, list);
  }
  return {
    site: { slug: site.slug, name: site.name },
    rooms: rooms.map((room) => ({
      id: room.id,
      number: room.number,
      type: room.type,
      audience: room.audience || 'mixed',
      floor: room.floor ?? 0,
      amenities: room.amenities || [],
      pricePerBed: room.pricePerBed,
      beds: byRoom.get(room.id) || [],
    })),
    note: 'Availability and live pricing are served by the Stayora reservation API.',
  };
}
