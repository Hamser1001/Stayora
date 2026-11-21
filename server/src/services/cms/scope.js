import { ApiError } from '../../middleware/error.js';

/**
 * Tenancy
 * -------
 * Stayora's tenancy model today is one workspace per deployment (`Setting` key
 * `workspace`). The CMS follows it instead of inventing a second tenant system:
 * the workspace key is a server constant and is never read from a request, so
 * a caller cannot address another workspace. `siteId` already scopes every
 * document, so a workspace with several hostel websites later needs a new site
 * row, not a schema rewrite.
 */
export const WORKSPACE_KEY = 'workspace';
export const SITE_ID = 'site_main';

export const SITE_STATUSES = ['draft', 'published'];
export const PAGE_STATUSES = ['draft', 'published'];
export const PAGE_VISIBILITIES = ['public', 'unlisted'];
export const SYSTEM_PAGE_KEYS = ['home', 'about', 'rooms', 'gallery', 'experiences', 'contact', 'custom'];

/** Slugs that would collide with API or dashboard routes. */
const RESERVED_SLUGS = new Set([
  'api',
  'cms',
  'admin',
  'login',
  'logout',
  'dashboard',
  'settings',
  'public',
  'uploads',
  'health',
  'assets',
  'static',
  'media',
  'preview',
  'booking',
  'book',
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function assertSlug(raw, { label = 'Slug', reserved = true } = {}) {
  const slug = slugify(raw);
  if (!slug) {
    throw new ApiError(`${label} is required.`, { code: 'INVALID_SLUG', status: 400 });
  }
  if (slug.length > 60 || !SLUG_RE.test(slug)) {
    throw new ApiError(`${label} must use lowercase letters, numbers and single hyphens.`, {
      code: 'INVALID_SLUG',
      status: 400,
    });
  }
  if (reserved && RESERVED_SLUGS.has(slug)) {
    throw new ApiError(`"${slug}" is reserved by Stayora. Choose another ${label.toLowerCase()}.`, {
      code: 'RESERVED_SLUG',
      status: 400,
    });
  }
  return slug;
}

export function text(value, { max = 4000, label = 'Value', required = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') {
    throw new ApiError(`${label} must be text.`, { code: 'VALIDATION_ERROR', status: 400 });
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new ApiError(`${label} is required.`, { code: 'VALIDATION_ERROR', status: 400 });
  }
  if (trimmed.length > max) {
    throw new ApiError(`${label} must be at most ${max} characters.`, {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }
  return trimmed;
}

export function option(value, allowed, { label = 'Value', fallback } = {}) {
  if (value === undefined || value === null || value === '') return fallback ?? allowed[0];
  const candidate = String(value);
  if (!allowed.includes(candidate)) {
    throw new ApiError(`${label} must be one of: ${allowed.join(', ')}.`, {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }
  return candidate;
}

export function safeLink(value, { label = 'Link' } = {}) {
  const link = text(value, { max: 500, label });
  if (!link) return '';
  if (!/^(https:\/\/[^\s]+|\/[^\s]*)$/i.test(link)) {
    throw new ApiError(`${label} must be an https:// link or a path starting with /.`, {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }
  return link;
}

export function isDuplicateKey(error) {
  return error?.code === 11000;
}
