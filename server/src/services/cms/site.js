import { cmsModels } from '../../db/cmsModels.js';
import { models } from '../../db/models.js';
import { ApiError } from '../../middleware/error.js';
import { assertSlug, option, SITE_ID, slugify, text, WORKSPACE_KEY } from './scope.js';
import { assertMedia } from './media.js';

/**
 * Website identity, branding and publication.
 * Branding colours are stored as hex tokens and fonts as tokens from a fixed
 * list; the public website maps both to its own design system.
 */
export const FONT_TOKENS = ['inter', 'jakarta', 'serif', 'display', 'mono'];
const HEX_RE = /^#[0-9a-f]{6}$/i;
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/i;

const DEFAULT_BRANDING = {
  logoMediaId: '',
  faviconMediaId: '',
  primaryColor: '#111827',
  secondaryColor: '#f5f5f4',
  accentColor: '#0f766e',
  headingFont: 'display',
  bodyFont: 'inter',
  radius: 12,
};

const DEFAULT_CONTACT = {
  email: '',
  phone: '',
  address: '',
  city: '',
  country: '',
  instagram: '',
  facebook: '',
};

const DEFAULT_SEO = {
  title: '',
  description: '',
  ogImageMediaId: '',
  noIndex: false,
  canonicalUrl: '',
};

export function siteDefaults(name = 'Stayora Hostel') {
  return {
    workspaceKey: WORKSPACE_KEY,
    slug: slugify(name) || 'stayora',
    name,
    tagline: '',
    description: '',
    status: 'draft',
    domain: '',
    locale: 'en',
    branding: { ...DEFAULT_BRANDING },
    contact: { ...DEFAULT_CONTACT },
    seo: { ...DEFAULT_SEO },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Loads the workspace site, creating it (and its starter content) once. */
export async function ensureSite() {
  let site = await cmsModels.CmsSite.findOne({ workspaceKey: WORKSPACE_KEY }).lean();
  if (site) return site;

  const setting = await models.Setting.findOne({ key: WORKSPACE_KEY }).lean();
  const name = setting?.data?.name || setting?.data?.hotelName || 'Stayora Hostel';
  const defaults = siteDefaults(name);

  try {
    site = await cmsModels.CmsSite.create({ ...defaults, id: SITE_ID });
  } catch (error) {
    // Two concurrent first requests: the unique index decides the winner.
    if (error?.code !== 11000) throw error;
    return cmsModels.CmsSite.findOne({ workspaceKey: WORKSPACE_KEY }).lean();
  }

  const { seedStarterContent } = await import('./seed.js');
  await seedStarterContent(site);
  return cmsModels.CmsSite.findOne({ workspaceKey: WORKSPACE_KEY }).lean();
}

/** Admin shape: ids plus dashboard-preview URLs, never a filesystem path. */
export function siteView(site) {
  return {
    id: site.id,
    slug: site.slug,
    name: site.name,
    tagline: site.tagline,
    description: site.description,
    status: site.status,
    domain: site.domain,
    locale: site.locale,
    branding: {
      ...DEFAULT_BRANDING,
      ...(site.branding || {}),
      logoUrl: site.branding?.logoMediaId ? `/api/cms/media/${site.branding.logoMediaId}/file` : '',
      faviconUrl: site.branding?.faviconMediaId ? `/api/cms/media/${site.branding.faviconMediaId}/file` : '',
    },
    contact: { ...DEFAULT_CONTACT, ...(site.contact || {}) },
    seo: {
      ...DEFAULT_SEO,
      ...(site.seo || {}),
      ogImageUrl: site.seo?.ogImageMediaId ? `/api/cms/media/${site.seo.ogImageMediaId}/file` : '',
    },
    publishedAt: site.publishedAt || null,
    updatedAt: site.updatedAt || null,
  };
}

function color(value, label) {
  const candidate = text(value, { max: 7, label });
  if (candidate && !HEX_RE.test(candidate)) {
    throw new ApiError(`${label} must be a hex colour such as #0f766e.`, {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }
  return candidate.toLowerCase();
}

async function mediaOrEmpty(raw, siteId, label) {
  const id = text(raw, { max: 64, label });
  if (!id) return '';
  await assertMedia(id, siteId, { label });
  return id;
}

async function normalizeBranding(input, current, siteId) {
  const source = { ...(current || {}), ...(input || {}) };
  const radius = source.radius === undefined || source.radius === null || source.radius === ''
    ? DEFAULT_BRANDING.radius
    : Number(source.radius);
  if (!Number.isFinite(radius) || radius < 0 || radius > 32) {
    throw new ApiError('Corner radius must be between 0 and 32.', { code: 'VALIDATION_ERROR', status: 400 });
  }
  return {
    logoMediaId: await mediaOrEmpty(source.logoMediaId, siteId, 'Logo'),
    faviconMediaId: await mediaOrEmpty(source.faviconMediaId, siteId, 'Favicon'),
    primaryColor: color(source.primaryColor, 'Primary colour') || DEFAULT_BRANDING.primaryColor,
    secondaryColor: color(source.secondaryColor, 'Secondary colour') || DEFAULT_BRANDING.secondaryColor,
    accentColor: color(source.accentColor, 'Accent colour') || DEFAULT_BRANDING.accentColor,
    headingFont: option(source.headingFont, FONT_TOKENS, { label: 'Heading font', fallback: 'display' }),
    bodyFont: option(source.bodyFont, FONT_TOKENS, { label: 'Body font', fallback: 'inter' }),
    radius: Math.round(radius),
  };
}

function normalizeContact(input, current) {
  const source = { ...(current || {}), ...(input || {}) };
  const email = text(source.email, { max: 120, label: 'Contact email' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new ApiError('Contact email is not a valid address.', { code: 'VALIDATION_ERROR', status: 400 });
  }
  return {
    email,
    phone: text(source.phone, { max: 40, label: 'Contact phone' }),
    address: text(source.address, { max: 160, label: 'Address' }),
    city: text(source.city, { max: 80, label: 'City' }),
    country: text(source.country, { max: 80, label: 'Country' }),
    instagram: text(source.instagram, { max: 120, label: 'Instagram' }),
    facebook: text(source.facebook, { max: 120, label: 'Facebook' }),
  };
}

async function normalizeSeo(input, current, siteId) {
  const source = { ...(current || {}), ...(input || {}) };
  const canonicalUrl = text(source.canonicalUrl, { max: 300, label: 'Canonical URL' });
  if (canonicalUrl && !/^https:\/\/[^\s]+$/i.test(canonicalUrl)) {
    throw new ApiError('Canonical URL must be an https:// address.', { code: 'VALIDATION_ERROR', status: 400 });
  }
  return {
    title: text(source.title, { max: 70, label: 'SEO title' }),
    description: text(source.description, { max: 180, label: 'Meta description' }),
    ogImageMediaId: await mediaOrEmpty(source.ogImageMediaId, siteId, 'Social image'),
    noIndex: Boolean(source.noIndex),
    canonicalUrl,
  };
}

/** Applies a partial site update. Only known sections can be written. */
export async function updateSite(patch, actor) {
  const site = await ensureSite();
  const body = patch && typeof patch === 'object' ? patch : {};
  const set = {};

  if (body.name !== undefined) set.name = text(body.name, { max: 120, label: 'Site name', required: true });
  if (body.tagline !== undefined) set.tagline = text(body.tagline, { max: 160, label: 'Tagline' });
  if (body.description !== undefined) {
    set.description = text(body.description, { max: 500, label: 'Description' });
  }
  if (body.locale !== undefined) set.locale = option(body.locale, ['en', 'fr'], { label: 'Language', fallback: 'en' });
  if (body.domain !== undefined) {
    const domain = text(body.domain, { max: 180, label: 'Custom domain' }).toLowerCase();
    if (domain && !DOMAIN_RE.test(domain)) {
      throw new ApiError('Custom domain is not a valid hostname.', { code: 'VALIDATION_ERROR', status: 400 });
    }
    set.domain = domain;
  }
  if (body.slug !== undefined) {
    const slug = assertSlug(body.slug, { label: 'Site address' });
    if (slug !== site.slug) {
      const clash = await cmsModels.CmsSite.findOne({ slug, workspaceKey: { $ne: WORKSPACE_KEY } }).lean();
      if (clash) throw new ApiError('That site address is already in use.', { code: 'SLUG_TAKEN', status: 409 });
      set.slug = slug;
    }
  }
  if (body.branding !== undefined) {
    set.branding = await normalizeBranding(body.branding, site.branding, site.id);
  }
  if (body.contact !== undefined) set.contact = normalizeContact(body.contact, site.contact);
  if (body.seo !== undefined) set.seo = await normalizeSeo(body.seo, site.seo, site.id);

  if (Object.keys(set).length === 0) return siteView(site);

  const updated = await cmsModels.CmsSite.findOneAndUpdate(
    { workspaceKey: WORKSPACE_KEY, id: site.id },
    { $set: { ...set, updatedAt: new Date().toISOString(), updatedBy: actor?.name || '' } },
    { new: true, lean: true },
  );
  return siteView(updated);
}

/**
 * Publishing the site makes its published pages reachable by the public API.
 * Every image that the public payload would serve has to be public, otherwise
 * the site would go live with broken images.
 */
export async function publishSite(actor) {
  const site = await ensureSite();
  const [pages, branding, seo] = await Promise.all([
    cmsModels.CmsPage.countDocuments({ siteId: site.id, status: 'published' }),
    Promise.resolve(site.branding || {}),
    Promise.resolve(site.seo || {}),
  ]);
  if (pages === 0) {
    throw new ApiError('Publish at least one page before publishing the website.', {
      code: 'NOTHING_TO_PUBLISH',
      status: 409,
    });
  }

  const mediaIds = [branding.logoMediaId, branding.faviconMediaId, seo.ogImageMediaId].filter(Boolean);
  for (const id of mediaIds) {
    const media = await assertMedia(id, site.id, { label: 'Branding image' });
    if (media.visibility !== 'public') {
      throw new ApiError('Branding images must be public before the website can be published.', {
        code: 'MEDIA_NOT_PUBLIC',
        status: 409,
        details: { mediaIds: [id] },
      });
    }
  }

  const now = new Date().toISOString();
  const updated = await cmsModels.CmsSite.findOneAndUpdate(
    { workspaceKey: WORKSPACE_KEY, id: site.id },
    { $set: { status: 'published', publishedAt: now, updatedAt: now, updatedBy: actor?.name || '' } },
    { new: true, lean: true },
  );
  return siteView(updated);
}

export async function unpublishSite(actor) {
  const site = await ensureSite();
  const updated = await cmsModels.CmsSite.findOneAndUpdate(
    { workspaceKey: WORKSPACE_KEY, id: site.id },
    {
      $set: {
        status: 'draft',
        publishedAt: null,
        updatedAt: new Date().toISOString(),
        updatedBy: actor?.name || '',
      },
    },
    { new: true, lean: true },
  );
  return siteView(updated);
}
