import mongoose from 'mongoose';
import { baseSchema } from './models.js';

const { Schema, model } = mongoose;

/**
 * CMS collections
 * ---------------
 * Every document carries `workspaceKey` (resolved on the server, never from a
 * request) and `siteId`. Today a workspace owns exactly one site, so the site
 * id is stable; the two-field scope is what lets a workspace grow to several
 * published websites without a migration.
 *
 * Nothing here duplicates operational data: rooms, beds, prices, availability,
 * reservations and guests stay in their own collections. CMS stores editorial
 * content only, and links to core records by id when it needs to.
 */

/** Website identity, branding, defaults and publication state for the site. */
const CmsSite = model(
  'CmsSite',
  baseSchema(
    {
      workspaceKey: { type: String, required: true, default: 'workspace' },
      slug: { type: String, required: true },
      name: { type: String, required: true },
      tagline: { type: String, default: '' },
      description: { type: String, default: '' },
      status: { type: String, default: 'draft' }, // draft | published
      domain: { type: String, default: '' },
      locale: { type: String, default: 'en' },
      branding: { type: Schema.Types.Mixed, default: () => ({}) },
      contact: { type: Schema.Types.Mixed, default: () => ({}) },
      seo: { type: Schema.Types.Mixed, default: () => ({}) },
      navigationVersion: { type: Number, default: 0 },
      seededAt: { type: String, default: null },
      publishedAt: { type: String, default: null },
      createdAt: { type: String, default: null },
      updatedAt: { type: String, default: null },
      updatedBy: { type: String, default: '' },
    },
    {
      collection: 'cms_sites',
      indexes: [
        [{ workspaceKey: 1 }, { unique: true }],
        [{ slug: 1 }, { unique: true }],
      ],
    },
  ),
);

/**
 * A page owns its draft fields plus an immutable `published` snapshot. Public
 * reads only ever touch the snapshot, so editing a live page can never expose
 * half-finished work.
 */
const CmsPage = model(
  'CmsPage',
  baseSchema(
    {
      workspaceKey: { type: String, required: true, default: 'workspace' },
      siteId: { type: String, required: true, index: true },
      title: { type: String, required: true },
      slug: { type: String, required: true },
      description: { type: String, default: '' },
      status: { type: String, default: 'draft' }, // draft | published
      visibility: { type: String, default: 'public' }, // public | unlisted
      systemKey: { type: String, default: null }, // home | about | rooms | ...
      order: { type: Number, default: 0 },
      seo: { type: Schema.Types.Mixed, default: () => ({}) },
      revision: { type: Number, default: 0 },
      published: { type: Schema.Types.Mixed, default: null },
      publishedAt: { type: String, default: null },
      publishedBy: { type: String, default: '' },
      createdAt: { type: String, default: null },
      updatedAt: { type: String, default: null },
      createdBy: { type: String, default: '' },
      updatedBy: { type: String, default: '' },
    },
    {
      collection: 'cms_pages',
      indexes: [
        [{ siteId: 1, slug: 1 }, { unique: true }],
        [{ siteId: 1, order: 1, id: 1 }, {}],
        [{ siteId: 1, status: 1 }, {}],
      ],
    },
  ),
);

/** One configurable block of a page. `content` is validated against the section registry. */
const CmsSection = model(
  'CmsSection',
  baseSchema(
    {
      workspaceKey: { type: String, required: true, default: 'workspace' },
      siteId: { type: String, required: true, index: true },
      pageId: { type: String, required: true, index: true },
      type: { type: String, required: true },
      variant: { type: String, default: '' },
      order: { type: Number, default: 0 },
      visible: { type: Boolean, default: true },
      contentVersion: { type: Number, default: 1 },
      content: { type: Schema.Types.Mixed, default: () => ({}) },
      createdAt: { type: String, default: null },
      updatedAt: { type: String, default: null },
      createdBy: { type: String, default: '' },
      updatedBy: { type: String, default: '' },
    },
    {
      collection: 'cms_sections',
      indexes: [[{ pageId: 1, order: 1 }, {}], [{ siteId: 1 }, {}]],
    },
  ),
);

/**
 * Media metadata. The binary lives in the media storage driver (local disk
 * today, object storage later) — never in MongoDB.
 */
const CmsMedia = model(
  'CmsMedia',
  baseSchema(
    {
      workspaceKey: { type: String, required: true, default: 'workspace' },
      siteId: { type: String, required: true, index: true },
      kind: { type: String, default: 'image' },
      filename: { type: String, required: true },
      storageKey: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      alt: { type: String, default: '' },
      caption: { type: String, default: '' },
      folder: { type: String, default: 'general' },
      visibility: { type: String, default: 'public' }, // public | private
      hash: { type: String, default: '' },
      uploadedBy: { type: String, default: '' },
      createdAt: { type: String, default: null },
      updatedAt: { type: String, default: null },
    },
    {
      collection: 'cms_media',
      indexes: [
        [{ siteId: 1, createdAt: -1 }, {}],
        [{ siteId: 1, hash: 1 }, {}],
        [{ siteId: 1, folder: 1 }, {}],
      ],
    },
  ),
);

/** One document per navigation location (header, footer). */
const CmsNavigation = model(
  'CmsNavigation',
  baseSchema(
    {
      workspaceKey: { type: String, required: true, default: 'workspace' },
      siteId: { type: String, required: true, index: true },
      location: { type: String, required: true }, // header | footer
      items: { type: [Schema.Types.Mixed], default: [] },
      updatedAt: { type: String, default: null },
      updatedBy: { type: String, default: '' },
    },
    {
      collection: 'cms_navigation',
      indexes: [[{ siteId: 1, location: 1 }, { unique: true }]],
    },
  ),
);

export const cmsModels = {
  CmsSite,
  CmsPage,
  CmsSection,
  CmsMedia,
  CmsNavigation,
};
