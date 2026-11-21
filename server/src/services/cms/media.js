import { createHash, randomUUID } from 'node:crypto';
import { cmsModels } from '../../db/cmsModels.js';
import { ApiError } from '../../middleware/error.js';
import { extensionFor, MAX_IMAGE_BYTES, probeImage } from '../../lib/imageProbe.js';
import { nextIdFor } from '../snapshot.js';
import { mediaStorage } from './mediaStorage.js';
import { option, SITE_ID, text, WORKSPACE_KEY } from './scope.js';

/**
 * Media library
 * -------------
 * Metadata lives in `cms_media`; the binary lives in the storage driver. Every
 * lookup is scoped by the server-resolved site, so an id from another workspace
 * simply does not exist here. Deletion is refused while published or drafted
 * content still points at the image, which keeps live pages from losing images.
 */
const FOLDER_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

function imageFromDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  if (!raw) throw new ApiError('Choose an image to upload.', { code: 'NO_FILE', status: 400 });
  const match = /^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=\s]+)$/i.exec(raw);
  const base64 = match ? match[2] : raw;
  let buffer;
  try {
    buffer = Buffer.from(base64.replace(/\s+/g, ''), 'base64');
  } catch {
    throw new ApiError('The image could not be read.', { code: 'INVALID_FILE', status: 400 });
  }
  if (!buffer.length) throw new ApiError('The image file is empty.', { code: 'INVALID_FILE', status: 400 });
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError('Images must be 5 MB or smaller.', { code: 'FILE_TOO_LARGE', status: 413 });
  }
  const probe = probeImage(buffer);
  if (!probe) {
    throw new ApiError('Only PNG, JPEG, WebP and GIF images are supported.', {
      code: 'UNSUPPORTED_MEDIA_TYPE',
      status: 400,
    });
  }
  return { buffer, ...probe };
}

function folderValue(value) {
  const folder = text(value, { max: 32, label: 'Folder' }).toLowerCase();
  if (!folder) return 'general';
  if (!FOLDER_RE.test(folder)) {
    throw new ApiError('Folder names use lowercase letters, numbers and hyphens.', {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }
  return folder;
}

export function mediaView(media, { publicScope = false } = {}) {
  return {
    id: media.id,
    kind: media.kind,
    filename: media.filename,
    mimeType: media.mimeType,
    size: media.size,
    width: media.width || 0,
    height: media.height || 0,
    alt: media.alt || '',
    caption: media.caption || '',
    folder: media.folder || 'general',
    visibility: media.visibility || 'public',
    url: publicScope ? `/api/public/media/${media.id}` : `/api/cms/media/${media.id}/file`,
    createdAt: media.createdAt || null,
  };
}

export async function listMedia({ q = '', folder = '', limit = 200 } = {}) {
  const filter = { workspaceKey: WORKSPACE_KEY, siteId: SITE_ID };
  if (folder) filter.folder = folderValue(folder);
  const search = text(q, { max: 80, label: 'Search' });
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ filename: regex }, { alt: regex }, { caption: regex }, { folder: regex }];
  }
  const rows = await cmsModels.CmsMedia.find(filter)
    .sort({ createdAt: -1, id: -1 })
    .limit(Math.min(500, Math.max(1, Number(limit) || 200)))
    .lean();
  return rows.map((row) => mediaView(row));
}

export async function getMedia(id) {
  const media = await cmsModels.CmsMedia.findOne({
    id: String(id || ''),
    workspaceKey: WORKSPACE_KEY,
    siteId: SITE_ID,
  }).lean();
  if (!media) throw new ApiError('Image not found.', { code: 'MEDIA_NOT_FOUND', status: 404 });
  return media;
}

/** Same-site lookup used by all content validation. Cross-site ids are 404s. */
export async function assertMedia(id, siteId) {
  const media = await cmsModels.CmsMedia.findOne({
    id: String(id || ''),
    siteId,
    workspaceKey: WORKSPACE_KEY,
  }).lean();
  if (!media) throw new ApiError('That image is not in this media library.', { code: 'MEDIA_NOT_FOUND', status: 404 });
  return media;
}

export async function createMedia(input, actor) {
  const { buffer, mime, width, height } = imageFromDataUrl(input?.dataUrl);
  const filename = text(input?.filename, { max: 160, label: 'File name' }) || `image.${extensionFor(mime)}`;
  const alt = text(input?.alt, { max: 160, label: 'Alt text' });
  const caption = text(input?.caption, { max: 300, label: 'Caption' });
  const folder = folderValue(input?.folder);
  const visibility = option(input?.visibility, ['public', 'private'], {
    label: 'Visibility',
    fallback: 'public',
  });

  const id = await nextIdFor('media', cmsModels.CmsMedia);
  const storageKey = `site/${randomUUID()}.${extensionFor(mime)}`;
  const storage = mediaStorage();
  await storage.put(storageKey, buffer);

  const now = new Date().toISOString();
  try {
    const media = await cmsModels.CmsMedia.create({
      id,
      workspaceKey: WORKSPACE_KEY,
      siteId: input?.siteId,
      kind: 'image',
      filename,
      storageKey,
      mimeType: mime,
      size: buffer.length,
      width,
      height,
      alt,
      caption,
      folder,
      visibility,
      hash: createHash('sha256').update(buffer).digest('hex'),
      uploadedBy: actor?.name || '',
      createdAt: now,
      updatedAt: now,
    });
    return mediaView(media.toObject());
  } catch (error) {
    await storage.remove(storageKey).catch(() => null);
    throw error;
  }
}

export async function updateMedia(id, patch, actor) {
  const media = await getMedia(id);
  const set = { updatedAt: new Date().toISOString() };
  if (patch?.alt !== undefined) set.alt = text(patch.alt, { max: 160, label: 'Alt text' });
  if (patch?.caption !== undefined) set.caption = text(patch.caption, { max: 300, label: 'Caption' });
  if (patch?.folder !== undefined) set.folder = folderValue(patch.folder);
  if (patch?.visibility !== undefined) {
    const visibility = option(patch.visibility, ['public', 'private'], { label: 'Visibility' });
    if (visibility === 'private' && (await mediaReferences(media.id, media.siteId)).some((ref) => ref.published)) {
      throw new ApiError('This image is used by a published page, so it must stay public.', {
        code: 'MEDIA_PUBLISHED_REFERENCE',
        status: 409,
      });
    }
    set.visibility = visibility;
  }

  const updated = await cmsModels.CmsMedia.findOneAndUpdate(
    { id: media.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID },
    { $set: { ...set, uploadedBy: media.uploadedBy || actor?.name || '' } },
    { new: true, lean: true },
  );
  return mediaView(updated);
}

/** Replaces the binary while keeping the id, so existing content keeps working. */
export async function replaceMedia(id, input, actor) {
  const media = await getMedia(id);
  const { buffer, mime, width, height } = imageFromDataUrl(input?.dataUrl);
  const storage = mediaStorage();
  const storageKey = `site/${randomUUID()}.${extensionFor(mime)}`;
  await storage.put(storageKey, buffer);

  try {
    const updated = await cmsModels.CmsMedia.findOneAndUpdate(
      { id: media.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID },
      {
        $set: {
          storageKey,
          mimeType: mime,
          size: buffer.length,
          width,
          height,
          hash: createHash('sha256').update(buffer).digest('hex'),
          filename: text(input?.filename, { max: 160, label: 'File name' }) || media.filename,
          updatedAt: new Date().toISOString(),
          uploadedBy: actor?.name || media.uploadedBy || '',
        },
      },
      { new: true, lean: true },
    );
    await storage.remove(media.storageKey).catch(() => null);
    return mediaView(updated);
  } catch (error) {
    await storage.remove(storageKey).catch(() => null);
    throw error;
  }
}

/** Page, snapshot and branding references to one image, scoped to its site. */
export async function mediaReferences(mediaId, siteId) {
  const [sections, pages, site] = await Promise.all([
    cmsModels.CmsSection.find({ siteId }, { pageId: 1, content: 1 }).lean(),
    cmsModels.CmsPage.find({ siteId }, { id: 1, title: 1, status: 1, published: 1 }).lean(),
    cmsModels.CmsSite.findOne({ workspaceKey: WORKSPACE_KEY, id: siteId }, { branding: 1, seo: 1 }).lean(),
  ]);

  const pageById = new Map(pages.map((page) => [page.id, page]));
  const refs = new Map();

  const add = (pageId) => {
    if (!pageId) {
      refs.set('site', { pageId: null, title: 'Website branding', published: true });
      return;
    }
    const page = pageById.get(pageId);
    refs.set(pageId, {
      pageId,
      title: page?.title || pageId,
      published: page?.status === 'published',
    });
  };

  for (const section of sections) {
    if (JSON.stringify(section.content || {}).includes(mediaId)) add(section.pageId);
  }
  for (const page of pages) {
    if (page.published && JSON.stringify(page.published).includes(mediaId)) add(page.id);
  }

  const branding = site?.branding || {};
  const seo = site?.seo || {};
  if (
    [branding.logoMediaId, branding.faviconMediaId, seo.ogImageMediaId].filter(Boolean).includes(mediaId)
  ) {
    add(null);
  }

  return [...refs.values()];
}

export async function deleteMedia(id) {
  const media = await getMedia(id);
  const refs = await mediaReferences(media.id, media.siteId);
  if (refs.length) {
    throw new ApiError('This image is used by a page. Remove it from the content first.', {
      code: 'MEDIA_IN_USE',
      status: 409,
      details: { references: refs },
    });
  }

  await cmsModels.CmsMedia.deleteOne({ id: media.id, workspaceKey: WORKSPACE_KEY, siteId: SITE_ID });
  await mediaStorage().remove(media.storageKey).catch(() => null);
  return { id: media.id, deleted: true };
}

export async function mediaBuffer(id) {
  const media = await getMedia(id);
  const buffer = await mediaStorage().get(media.storageKey);
  return { media, buffer };
}

export async function mediaFolders() {
  const rows = await cmsModels.CmsMedia.distinct('folder', { workspaceKey: WORKSPACE_KEY, siteId: SITE_ID });
  return ['general', ...rows.filter((folder) => folder && folder !== 'general').sort()];
}
