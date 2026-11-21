import { ApiError } from '../../middleware/error.js';

/**
 * Section registry
 * ----------------
 * A page is a list of typed blocks. Adding a new block type is a registry entry
 * plus a renderer on the public website — no schema or column change, and no
 * deploy of the dashboard's data model. Every write is validated here, on the
 * server, against the declared fields: unknown keys are dropped, types are
 * enforced, lengths are bounded and links must be safe.
 *
 * Rich text is intentionally not raw HTML: the public website renders strings
 * as text, so stored content cannot carry script or markup injection.
 */

const LINK_RE = /^(https:\/\/[^\s]+|\/[^\s]*)$/i;

const FIELD_LIMITS = {
  text: 200,
  textarea: 4000,
  url: 500,
  image: 64,
};

const field = (key, label, type, extra = {}) => ({ key, label, type, ...extra });

const alignField = field('align', 'Alignment', 'select', {
  options: ['left', 'center'],
  default: 'left',
});

const ctaFields = [
  field('ctaLabel', 'Button label', 'text', { maxLength: 48 }),
  field('ctaHref', 'Button link', 'url'),
];

const itemFieldsOf = (fields) => fields;

export const SECTION_TYPES = {
  hero: {
    label: 'Hero',
    description: 'Full-width headline, background image and a primary action.',
    version: 1,
    fields: [
      field('heading', 'Heading', 'text', { required: true, maxLength: 120 }),
      field('subheading', 'Subheading', 'textarea', { maxLength: 280 }),
      field('image', 'Background image', 'image'),
      field('overlay', 'Image overlay', 'select', { options: ['none', 'soft', 'strong'], default: 'soft' }),
      alignField,
      ...ctaFields,
    ],
  },
  text: {
    label: 'Text',
    description: 'A heading and a paragraph of copy.',
    version: 1,
    fields: [
      field('heading', 'Heading', 'text', { maxLength: 120 }),
      field('body', 'Body', 'textarea', { required: true, maxLength: 4000 }),
      alignField,
    ],
  },
  image: {
    label: 'Image',
    description: 'One image with an optional caption and link.',
    version: 1,
    fields: [
      field('image', 'Image', 'image', { required: true }),
      field('caption', 'Caption', 'text', { maxLength: 160 }),
      field('link', 'Link', 'url'),
    ],
  },
  imageText: {
    label: 'Image & text',
    description: 'Copy beside an image, in either order.',
    version: 1,
    fields: [
      field('heading', 'Heading', 'text', { required: true, maxLength: 120 }),
      field('body', 'Body', 'textarea', { maxLength: 2000 }),
      field('image', 'Image', 'image', { required: true }),
      field('mediaSide', 'Image side', 'select', { options: ['left', 'right'], default: 'left' }),
      ...ctaFields,
    ],
  },
  gallery: {
    label: 'Gallery',
    description: 'A set of images in a grid or carousel.',
    version: 1,
    fields: [
      field('heading', 'Heading', 'text', { maxLength: 120 }),
      field('images', 'Images', 'imageList', { maxItems: 24 }),
      field('layout', 'Layout', 'select', { options: ['grid', 'masonry', 'carousel'], default: 'grid' }),
    ],
  },
  features: {
    label: 'Features & amenities',
    description: 'A list of short highlights, such as amenities or services.',
    version: 1,
    fields: [
      field('heading', 'Heading', 'text', { maxLength: 120 }),
      field('intro', 'Intro', 'textarea', { maxLength: 400 }),
      field('items', 'Highlights', 'list', {
        maxItems: 12,
        itemFields: itemFieldsOf([
          field('title', 'Title', 'text', { required: true, maxLength: 80 }),
          field('description', 'Description', 'textarea', { maxLength: 300 }),
        ]),
      }),
    ],
  },
  testimonials: {
    label: 'Testimonials',
    description: 'Guest quotes with an author and optional rating.',
    version: 1,
    fields: [
      field('heading', 'Heading', 'text', { maxLength: 120 }),
      field('items', 'Quotes', 'list', {
        maxItems: 10,
        itemFields: itemFieldsOf([
          field('quote', 'Quote', 'textarea', { required: true, maxLength: 400 }),
          field('author', 'Author', 'text', { maxLength: 80 }),
          field('location', 'Location', 'text', { maxLength: 80 }),
          field('rating', 'Rating', 'number', { min: 1, max: 5 }),
        ]),
      }),
    ],
  },
  cta: {
    label: 'Call to action',
    description: 'A closing block with one primary action.',
    version: 1,
    fields: [
      field('heading', 'Heading', 'text', { required: true, maxLength: 120 }),
      field('body', 'Body', 'textarea', { maxLength: 600 }),
      field('image', 'Background image', 'image'),
      ...ctaFields,
    ],
  },
  faq: {
    label: 'FAQ',
    description: 'Questions and answers.',
    version: 1,
    fields: [
      field('heading', 'Heading', 'text', { maxLength: 120 }),
      field('items', 'Questions', 'list', {
        maxItems: 20,
        itemFields: itemFieldsOf([
          field('question', 'Question', 'text', { required: true, maxLength: 200 }),
          field('answer', 'Answer', 'textarea', { required: true, maxLength: 1200 }),
        ]),
      }),
    ],
  },
  custom: {
    label: 'Custom block',
    description: 'Free-form heading, copy and image for anything that does not fit a preset.',
    version: 1,
    fields: [
      field('heading', 'Heading', 'text', { maxLength: 120 }),
      field('body', 'Body', 'textarea', { maxLength: 4000 }),
      field('image', 'Image', 'image'),
      ...ctaFields,
    ],
  },
};

export const SECTION_TYPE_KEYS = Object.keys(SECTION_TYPES);

export function sectionType(type) {
  return Object.prototype.hasOwnProperty.call(SECTION_TYPES, String(type || ''))
    ? SECTION_TYPES[String(type)]
    : null;
}

/** Metadata for the dashboard's dynamic editor (no content, safe to expose). */
export function sectionCatalog() {
  return SECTION_TYPE_KEYS.map((key) => ({
    type: key,
    label: SECTION_TYPES[key].label,
    description: SECTION_TYPES[key].description,
    version: SECTION_TYPES[key].version,
    fields: SECTION_TYPES[key].fields,
  }));
}

function textLimit(fieldType, spec) {
  return spec.maxLength || FIELD_LIMITS[fieldType] || 4000;
}

function checkUrl(value) {
  return value === '' || LINK_RE.test(value);
}

function validateScalar(spec, raw, path, errors) {
  switch (spec.type) {
    case 'text':
    case 'textarea': {
      if (raw === undefined || raw === null) raw = '';
      if (typeof raw !== 'string') {
        errors.push(`${path} must be text.`);
        return '';
      }
      const value = raw.trim();
      if (value.length > textLimit(spec.type, spec)) {
        errors.push(`${path} must be at most ${textLimit(spec.type, spec)} characters.`);
      }
      if (spec.required && !value) errors.push(`${path} is required.`);
      return value;
    }
    case 'url': {
      if (raw === undefined || raw === null) raw = '';
      if (typeof raw !== 'string') {
        errors.push(`${path} must be a link.`);
        return '';
      }
      const value = raw.trim();
      if (value.length > FIELD_LIMITS.url) errors.push(`${path} is too long.`);
      if (!checkUrl(value)) {
        errors.push(`${path} must be an https:// link or a path starting with /.`);
      }
      return value;
    }
    case 'image': {
      if (raw === undefined || raw === null) raw = '';
      if (typeof raw !== 'string') {
        errors.push(`${path} must be a media id.`);
        return '';
      }
      const value = raw.trim();
      if (value.length > FIELD_LIMITS.image) errors.push(`${path} is not a valid media reference.`);
      if (spec.required && !value) errors.push(`${path} is required.`);
      return value;
    }
    case 'imageList': {
      const list = Array.isArray(raw) ? raw : [];
      const max = spec.maxItems || 24;
      if (list.length > max) errors.push(`${path} can hold at most ${max} images.`);
      return list
        .slice(0, max)
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0 && entry.length <= FIELD_LIMITS.image);
    }
    case 'number': {
      if (raw === undefined || raw === null || raw === '') return null;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        errors.push(`${path} must be a number.`);
        return null;
      }
      if (spec.min !== undefined && value < spec.min) errors.push(`${path} must be at least ${spec.min}.`);
      if (spec.max !== undefined && value > spec.max) errors.push(`${path} must be at most ${spec.max}.`);
      return value;
    }
    case 'boolean':
      return Boolean(raw);
    case 'select': {
      if (raw === undefined || raw === null || raw === '') return spec.default ?? spec.options?.[0] ?? '';
      const value = String(raw);
      if (!(spec.options || []).includes(value)) {
        errors.push(`${path} must be one of: ${(spec.options || []).join(', ')}.`);
        return spec.default ?? '';
      }
      return value;
    }
    case 'list': {
      const list = Array.isArray(raw) ? raw : [];
      const max = spec.maxItems || 20;
      if (list.length > max) errors.push(`${path} can hold at most ${max} items.`);
      return list.slice(0, max).map((entry, index) => {
        const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
        const normalized = validateFields(spec.itemFields || [], source, `${path}[${index}]`, errors);
        return normalized;
      });
    }
    default:
      return null;
  }
}

/** Validates and normalises a content object against a field list. */
export function validateFields(fields, content, path, errors) {
  const source = content && typeof content === 'object' && !Array.isArray(content) ? content : {};
  const normalized = {};
  for (const spec of fields) {
    const value = validateScalar(spec, source[spec.key], `${path}.${spec.key}`, errors);
    if (spec.type === 'text' || spec.type === 'textarea' || spec.type === 'url' || spec.type === 'image') {
      if (value !== '' || spec.required || source[spec.key] !== undefined) normalized[spec.key] = value;
    } else if (value !== null || source[spec.key] !== undefined) {
      normalized[spec.key] = value;
    }
  }
  return normalized;
}

/**
 * Normalises a section payload. Throws ApiError-shaped data through the
 * provided `fail` helper so routes keep one error format.
 */
export function validateSection({ type, variant, content }, { fail }) {
  const spec = sectionType(type);
  if (!spec) {
    fail(`Unknown section type: ${String(type || '').slice(0, 40)}.`, 'UNKNOWN_SECTION_TYPE', 400);
  }

  const errors = [];
  const normalized = validateFields(spec.fields, content, 'content', errors);

  // A block with no visible content is never useful on a public page.
  const hasValue = Object.values(normalized).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value === null || value === undefined) return false;
    return typeof value !== 'string' || value.length > 0;
  });
  if (!hasValue) fail('Add some content before saving this section.', 'EMPTY_SECTION', 400);

  if (errors.length) {
    throw new ApiError(errors[0], {
      code: 'VALIDATION_ERROR',
      status: 400,
      details: { fieldErrors: errors.slice(0, 12) },
    });
  }

  const variantValue = typeof variant === 'string' ? variant.trim().toLowerCase() : '';
  if (variantValue && !/^[a-z0-9-]{1,32}$/.test(variantValue)) {
    fail('Unsupported section variant.', 'VALIDATION_ERROR', 400);
  }

  return {
    type,
    variant: variantValue,
    contentVersion: spec.version,
    content: normalized,
  };
}

/** Recursively collects media ids referenced by normalised content. */
export function mediaIdsIn(content, fields = null, out = new Set()) {
  if (!content || typeof content !== 'object') return out;
  if (Array.isArray(content)) {
    for (const entry of content) mediaIdsIn(entry, fields, out);
    return out;
  }
  for (const [key, value] of Object.entries(content)) {
    const spec = fields?.find((entry) => entry.key === key);
    if (value && typeof value === 'object') {
      mediaIdsIn(value, spec?.itemFields || null, out);
    } else if (typeof value === 'string' && spec) {
      if (spec.type === 'image' && value) out.add(value);
      if (spec.type === 'imageList') out.add(value);
    }
  }
  return out;
}

export function mediaIdsForSection(section) {
  const spec = sectionType(section.type);
  const set = new Set();
  if (!spec) return set;
  for (const entry of mediaIdsIn(section.content || {}, spec.fields, new Set())) set.add(entry);
  return set;
}
