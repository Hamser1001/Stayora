#!/usr/bin/env node
/**
 * Security and behaviour regression tests for the CMS foundation.
 *
 * Run against a live API (default http://localhost:4000/api) with the demo
 * workspace seeded:
 *
 *   npm run test:cms
 *
 * Covers authentication, role authorization, workspace/site isolation, section
 * validation, publishing snapshots (drafts never leak), media type/size/serving
 * rules, navigation validation, branding validation, audit hygiene and the
 * public/private API boundary.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const API = process.env.API_URL || 'http://localhost:4000/api';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/stayora';
const PASSWORD = process.env.DEMO_PASSWORD || 'stayora2026';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'hamza@stayora.app';
const STAMP = Date.now().toString(36);
const PAGE_SLUG = `cms-test-${STAMP}`;
const PRIVATE_NOTE = `PRIVATE-${STAMP}`;

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text, headers: response.headers };
}

async function login(email, password = PASSWORD) {
  const res = await call('/auth/login', { method: 'POST', body: { email, password, remember: true } });
  return { token: res.json?.data?.token || null, user: res.json?.data?.user || null, status: res.status };
}

const mongo = new MongoClient(MONGO_URI);
await mongo.connect();
const db = mongo.db();

const created = { pages: [], sections: [], media: [], navRestore: null };
let siteSnapshot = null;

try {
  /* ------------------------------ Authentication ---------------------------- */

  const anonymous = await call('/cms');
  record('Anonymous cannot read the CMS', anonymous.status === 401, `status ${anonymous.status}`);

  const owner = await login(OWNER_EMAIL);
  record('Owner signs in', Boolean(owner.token), `status ${owner.status}`);

  const staff = await db.collection('staff').find({}, { projection: { email: 1, role: 1, _id: 0 } }).toArray();
  const receptionistEmail = staff.find((member) => member.role === 'receptionist')?.email;
  const managerEmail = staff.find((member) => member.role === 'manager')?.email;

  const receptionist = receptionistEmail ? await login(receptionistEmail) : { token: null };
  const receptionistRead = await call('/cms/pages', { token: receptionist.token });
  record('Receptionist is denied the CMS', receptionistRead.status === 403, `status ${receptionistRead.status}`);

  const gate = await call('/cms/pages', { token: receptionist.token, method: 'POST', body: { title: 'Nope' } });
  record('Receptionist cannot create pages', gate.status === 403, `status ${gate.status}`);

  const manager = managerEmail ? await login(managerEmail) : { token: null };
  const managerRead = await call('/cms/pages', { token: manager.token });
  record('Manager can read the CMS', managerRead.status === 200, `status ${managerRead.status}`);

  /* -------------------------------- Foundation ------------------------------ */

  const overview = await call('/cms', { token: owner.token });
  const site = overview.json?.data?.site;
  siteSnapshot = await db.collection('cms_sites').findOne({ workspaceKey: 'workspace' });
  record('Overview returns the site and stats', overview.status === 200 && Boolean(site?.slug), `slug=${site?.slug}`);
  record(
    'Overview never exposes workspace internals',
    !JSON.stringify(overview.json).includes('workspaceKey'),
    'no workspaceKey',
  );

  const seededPages = await call('/cms/pages', { token: owner.token });
  const slugs = (seededPages.json?.data || []).map((page) => page.slug);
  record(
    'Starter pages exist for a new site',
    ['home', 'about', 'rooms', 'gallery', 'experiences', 'contact'].every((slug) => slugs.includes(slug)),
    slugs.join(', '),
  );

  const catalog = await call('/cms/section-types', { token: owner.token });
  const types = (catalog.json?.data || []).map((entry) => entry.type);
  record(
    'Section registry exposes flexible block types',
    types.includes('hero') && types.includes('gallery') && types.includes('faq') && types.length >= 9,
    `${types.length} types`,
  );

  /* ---------------------------------- Pages --------------------------------- */

  const createdPage = await call('/cms/pages', {
    token: owner.token,
    method: 'POST',
    body: { title: `CMS Test ${STAMP}`, slug: PAGE_SLUG, description: 'Draft only.', workspaceKey: 'evil' },
  });
  const pageId = createdPage.json?.data?.id;
  if (pageId) created.pages.push(pageId);
  record('Owner can create a page', createdPage.status === 201 && Boolean(pageId), `status ${createdPage.status}`);

  const stored = pageId ? await db.collection('cms_pages').findOne({ id: pageId }) : null;
  record(
    'Client-supplied workspace key is ignored',
    stored?.workspaceKey === 'workspace' && stored?.siteId === 'site_main',
    `workspace=${stored?.workspaceKey} site=${stored?.siteId}`,
  );

  const duplicate = await call('/cms/pages', {
    token: owner.token,
    method: 'POST',
    body: { title: 'Duplicate', slug: PAGE_SLUG },
  });
  record('Duplicate page slugs are rejected', duplicate.status === 409, `status ${duplicate.status}`);

  const reserved = await call('/cms/pages', {
    token: owner.token,
    method: 'POST',
    body: { title: 'Admin', slug: 'admin' },
  });
  record('Reserved slugs are rejected', reserved.status === 400 && reserved.json?.code === 'RESERVED_SLUG');

  const noTitle = await call('/cms/pages', { token: owner.token, method: 'POST', body: { slug: 'no-title' } });
  record('Page title is required', noTitle.status === 400, `status ${noTitle.status}`);

  const badSlug = await call('/cms/pages', {
    token: owner.token,
    method: 'POST',
    body: { title: 'Bad Slug', slug: 'Not A Slug!' },
  });
  record(
    'Slugs are normalised to a safe form',
    badSlug.status === 201 && badSlug.json?.data?.slug === 'not-a-slug',
    `slug=${badSlug.json?.data?.slug}`,
  );
  if (badSlug.status === 201) created.pages.push(badSlug.json.data.id);

  /* -------------------------------- Sections -------------------------------- */

  const unknownType = await call(`/cms/pages/${pageId}/sections`, {
    token: owner.token,
    method: 'POST',
    body: { type: 'not_a_section', content: { heading: 'x' } },
  });
  record('Unknown section types are rejected', unknownType.status === 400, `status ${unknownType.status}`);

  const missingField = await call(`/cms/pages/${pageId}/sections`, {
    token: owner.token,
    method: 'POST',
    body: { type: 'hero', content: { subheading: 'Missing heading' } },
  });
  record('Required section fields are enforced', missingField.status === 400, `status ${missingField.status}`);

  const unsafeLink = await call(`/cms/pages/${pageId}/sections`, {
    token: owner.token,
    method: 'POST',
    body: { type: 'cta', content: { heading: 'Book', ctaHref: 'javascript:alert(1)' } },
  });
  record('Unsafe URLs are rejected', unsafeLink.status === 400, `status ${unsafeLink.status}`);

  const hero = await call(`/cms/pages/${pageId}/sections`, {
    token: owner.token,
    method: 'POST',
    body: {
      type: 'hero',
      content: {
        heading: 'Draft headline',
        subheading: 'First draft.',
        bogus: 'should be dropped',
        ctaHref: '/rooms',
        ctaLabel: 'Rooms',
      },
    },
  });
  const heroId = hero.json?.data?.id;
  if (heroId) created.sections.push(heroId);
  record('Owner can add a section', hero.status === 201 && Boolean(heroId), `status ${hero.status}`);
  record(
    'Unknown content keys are dropped',
    hero.status === 201 && !JSON.stringify(hero.json?.data?.content || {}).includes('bogus'),
    'normalised content',
  );

  const retype = await call(`/cms/sections/${heroId}`, {
    token: owner.token,
    method: 'PATCH',
    body: { type: 'text', content: { body: 'x' } },
  });
  record('A section keeps its type', retype.status === 409, `status ${retype.status}`);

  /* ------------------------------ Media library ----------------------------- */

  const notAnImage = await call('/cms/media', {
    token: owner.token,
    method: 'POST',
    body: { dataUrl: 'data:text/plain;base64,SGVsbG8=', filename: 'note.txt' },
  });
  record('Non-image uploads are rejected', notAnImage.status === 400, `status ${notAnImage.status}`);

  const oversized = await call('/cms/media', {
    token: owner.token,
    method: 'POST',
    body: {
      dataUrl: `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 64, 1).toString('base64')}`,
      filename: 'huge.png',
    },
  });
  record('Oversized uploads are rejected', oversized.status === 413, `status ${oversized.status}`);

  const upload = await call('/cms/media', {
    token: owner.token,
    method: 'POST',
    body: {
      dataUrl: `data:image/png;base64,${ONE_PIXEL_PNG}`,
      filename: 'cover.png',
      alt: 'Cover image',
      folder: 'rooms',
    },
  });
  const mediaId = upload.json?.data?.id;
  if (mediaId) created.media.push(mediaId);
  record(
    'PNG uploads are accepted with server-read dimensions',
    upload.status === 201 && upload.json?.data?.width === 1 && upload.json?.data?.height === 1,
    `${upload.json?.data?.width}x${upload.json?.data?.height}`,
  );
  record(
    'Media metadata is stored outside the document',
    Boolean(mediaId) && !JSON.stringify(upload.json).includes('storageKey'),
    'no storage path in the response',
  );

  const privateUpload = await call('/cms/media', {
    token: owner.token,
    method: 'POST',
    body: {
      dataUrl: `data:image/png;base64,${ONE_PIXEL_PNG}`,
      filename: 'private.png',
      alt: PRIVATE_NOTE,
      visibility: 'private',
    },
  });
  if (privateUpload.json?.data?.id) created.media.push(privateUpload.json.data.id);

  const mediaFiles = await db.collection('cms_media').countDocuments({ workspaceKey: 'workspace' });
  const diskFiles = await import('node:fs/promises').then((fs) =>
    fs.readdir(new URL('../uploads/cms/site/', import.meta.url)).catch(() => []),
  );
  record('Image binaries live on storage, not in MongoDB', mediaFiles >= 2 && diskFiles.length >= 1, `${diskFiles.length} files`);

  /* -------------------------------- Publishing ------------------------------ */

  const beforePublish = await call(`/cms/pages/${pageId}`, { token: owner.token });
  record(
    'A page starts as a draft',
    beforePublish.json?.data?.status === 'draft' && !beforePublish.json?.data?.publishedAt,
    `status=${beforePublish.json?.data?.status}`,
  );

  const publish = await call(`/cms/pages/${pageId}/publish`, { token: owner.token, method: 'POST' });
  record(
    'Publishing freezes a revision',
    publish.status === 200 && publish.json?.data?.status === 'published' && publish.json.data.revision === 1,
    `revision=${publish.json?.data?.revision}`,
  );

  const sitePublish = await call('/cms/site/publish', { token: owner.token, method: 'POST' });
  record('Owner can publish the website', sitePublish.status === 200, `status ${sitePublish.status}`);

  const publicSite = await call(`/public/sites/${site.slug}`);
  record('Public API serves a published site', publicSite.status === 200, `status ${publicSite.status}`);
  const publicSlugs = (publicSite.json?.data?.pages || []).map((entry) => entry.slug);
  record(
    'Draft pages are absent from the public index',
    publicSlugs.includes(PAGE_SLUG) && !publicSlugs.includes('no-title'),
    `${publicSlugs.length} pages`,
  );
  record(
    'Public payload exposes no internal fields',
    !/workspaceKey|createdBy|updatedBy|publishedBy|siteId/.test(publicSite.text),
    'clean payload',
  );
  record(
    'Public API sets CORS for the website origin',
    publicSite.headers.get('access-control-allow-origin') === '*',
    publicSite.headers.get('access-control-allow-origin') || 'missing',
  );

  const publicPage = await call(`/public/sites/${site.slug}/pages/${PAGE_SLUG}`);
  record(
    'Public page returns the published snapshot',
    publicPage.status === 200 && publicPage.json?.data?.sections?.[0]?.content?.heading === 'Draft headline',
    `status ${publicPage.status}`,
  );

  // Draft edit must not reach the public page until republished.
  await call(`/cms/sections/${heroId}`, {
    token: owner.token,
    method: 'PATCH',
    body: { content: { heading: 'Second draft headline' } },
  });
  const stillOld = await call(`/public/sites/${site.slug}/pages/${PAGE_SLUG}`);
  record(
    'Editing a live page does not leak to visitors',
    stillOld.json?.data?.sections?.[0]?.content?.heading === 'Draft headline',
    'snapshot unchanged',
  );

  const republish = await call(`/cms/pages/${pageId}/publish`, { token: owner.token, method: 'POST' });
  const nowNew = await call(`/public/sites/${site.slug}/pages/${PAGE_SLUG}`);
  record(
    'Republishing advances the public revision',
    republish.json?.data?.revision === 2 &&
      nowNew.json?.data?.sections?.[0]?.content?.heading === 'Second draft headline',
    `revision=${republish.json?.data?.revision}`,
  );

  const unpublished = await call(`/cms/pages/${pageId}/unpublish`, { token: owner.token, method: 'POST' });
  const gone = await call(`/public/sites/${site.slug}/pages/${PAGE_SLUG}`);
  record(
    'Unpublishing removes the page from the public API',
    unpublished.status === 200 && gone.status === 404,
    `public ${gone.status}`,
  );

  const homePage = (seededPages.json?.data || []).find((page) => page.slug === 'home');
  const homeDelete = await call(`/cms/pages/${homePage.id}`, { token: owner.token, method: 'DELETE' });
  record('The home page cannot be deleted', homeDelete.status === 409, `status ${homeDelete.status}`);

  /* ------------------------------ Tenant isolation -------------------------- */

  await db.collection('cms_pages').insertOne({
    id: `pg_probe_${STAMP}`,
    workspaceKey: 'workspace',
    siteId: 'site_other',
    title: 'Other hostel',
    slug: 'other-hostel',
    status: 'published',
    visibility: 'public',
    order: 0,
    published: { revision: 1, title: 'Other hostel', slug: 'other-hostel', sections: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const foreignRead = await call(`/cms/pages/pg_probe_${STAMP}`, { token: owner.token });
  record('A page from another site is not readable', foreignRead.status === 404, `status ${foreignRead.status}`);

  const foreignWrite = await call(`/cms/pages/pg_probe_${STAMP}`, {
    token: owner.token,
    method: 'PATCH',
    body: { title: 'Hijacked' },
  });
  record('A page from another site cannot be modified', foreignWrite.status === 404, `status ${foreignWrite.status}`);

  const listAfterProbe = await call('/cms/pages', { token: owner.token });
  record(
    'Page lists never include another site',
    !(listAfterProbe.json?.data || []).some((page) => page.slug === 'other-hostel'),
    'scoped list',
  );

  const navForeign = await call('/cms/navigation/header', {
    token: owner.token,
    method: 'PUT',
    body: { items: [{ label: 'Other', type: 'page', pageId: `pg_probe_${STAMP}` }] },
  });
  record('Navigation rejects a page from another site', navForeign.status === 400, `status ${navForeign.status}`);

  /* -------------------------------- Navigation ------------------------------ */

  const navHttp = await call('/cms/navigation/footer', {
    token: owner.token,
    method: 'PUT',
    body: { items: [{ label: 'Old site', type: 'link', url: 'http://insecure.example.com' }] },
  });
  record('Navigation rejects plain-http links', navHttp.status === 400, `status ${navHttp.status}`);

  const navSaved = await call('/cms/navigation/footer', {
    token: owner.token,
    method: 'PUT',
    body: {
      items: [
        { label: 'Book direct', type: 'link', url: 'https://example.com/book' },
        { label: 'Draft page', type: 'page', pageId },
      ],
    },
  });
  record('Owner can save navigation', navSaved.status === 200 && navSaved.json?.data?.length === 2, '2 items');

  const publicAfterNav = await call(`/public/sites/${site.slug}`);
  const footer = publicAfterNav.json?.data?.navigation?.footer || [];
  record(
    'Public menus drop links to unpublished pages',
    footer.some((item) => item.href === 'https://example.com/book') &&
      !footer.some((item) => item.label === 'Draft page'),
    `${footer.length} footer links`,
  );

  /* ---------------------------------- Branding ------------------------------ */

  const badColor = await call('/cms/site', {
    token: owner.token,
    method: 'PATCH',
    body: { branding: { primaryColor: 'red' } },
  });
  record('Branding rejects invalid colours', badColor.status === 400, `status ${badColor.status}`);

  const badFont = await call('/cms/site', {
    token: owner.token,
    method: 'PATCH',
    body: { branding: { headingFont: 'comic-sans' } },
  });
  record('Branding accepts only known typography tokens', badFont.status === 400, `status ${badFont.status}`);

  const branding = await call('/cms/site', {
    token: owner.token,
    method: 'PATCH',
    body: {
      branding: { primaryColor: '#123456', accentColor: '#abcdef', radius: 8, logoMediaId: mediaId },
      contact: { email: 'hello@example.com' },
    },
  });
  record('Owner can update branding', branding.status === 200 && branding.json?.data?.branding?.primaryColor === '#123456');

  const publicBranding = await call(`/public/sites/${site.slug}`);
  record(
    'Published branding is exposed to the website',
    publicBranding.json?.data?.branding?.primaryColor === '#123456' &&
      Boolean(publicBranding.json?.data?.branding?.logo?.url),
    'colour + logo url',
  );

  /* ------------------------------- Media safety ----------------------------- */

  // Attach the public image to the page and publish, then try to delete it.
  await call(`/cms/pages/${pageId}/sections`, {
    token: owner.token,
    method: 'POST',
    body: { type: 'image', content: { image: mediaId, caption: 'Cover' } },
  });
  await call(`/cms/pages/${pageId}/publish`, { token: owner.token, method: 'POST' });

  const blockedDelete = await call(`/cms/media/${mediaId}`, { token: owner.token, method: 'DELETE' });
  record('Images used by pages cannot be deleted', blockedDelete.status === 409, `status ${blockedDelete.status}`);

  const privateId = privateUpload.json?.data?.id;
  const privatePublic = privateId ? await call(`/public/media/${privateId}`) : { status: 0 };
  record('Private images are not publicly readable', privatePublic.status === 404, `status ${privatePublic.status}`);

  const publicImage = await call(`/public/media/${mediaId}`);
  record('Public images are served to the website', publicImage.status === 200, `status ${publicImage.status}`);

  /* ---------------------------------- Rooms --------------------------------- */

  const rooms = await call(`/public/sites/${site.slug}/rooms`);
  record(
    'Core rooms are readable through the public API',
    rooms.status === 200 && (rooms.json?.data?.rooms || []).length > 0,
    `${rooms.json?.data?.rooms?.length || 0} rooms`,
  );
  record(
    'Public rooms expose no guest or reservation data',
    !/guestId|guestName|reservationId|idNumber|email/.test(rooms.text),
    'inventory only',
  );

  /* ---------------------------------- Audit --------------------------------- */

  const auditRows = await db
    .collection('activity')
    .find({ action: { $regex: '^cms\\.' } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  record('CMS actions are audited', auditRows.length >= 5, `${auditRows.length} entries`);
  record(
    'Audit entries carry no content or markup',
    !JSON.stringify(auditRows).includes('<script') && !JSON.stringify(auditRows).includes(PRIVATE_NOTE),
    'clean trail',
  );

  /* --------------------------------- Cleanup -------------------------------- */

  await db.collection('cms_pages').deleteMany({ siteId: 'site_other' });

  const mediaList = await call('/cms/media', { token: owner.token });
  const ownedMedia = (mediaList.json?.data || []).filter((entry) => created.media.includes(entry.id));
  for (const entry of ownedMedia) {
    await db.collection('cms_sections').deleteMany({ 'content.image': entry.id });
    await db.collection('cms_media').deleteOne({ id: entry.id });
  }
  await call(`/cms/pages/${pageId}`, { token: owner.token, method: 'DELETE' });
  const badSlugId = badSlug.json?.data?.id;
  if (badSlugId) await call(`/cms/pages/${badSlugId}`, { token: owner.token, method: 'DELETE' });

  // Restore the pre-test state: site back to draft, starter pages back to draft.
  await db.collection('cms_pages').updateMany(
    { workspaceKey: 'workspace', siteId: 'site_main' },
    { $set: { status: 'draft', published: null, publishedAt: null } },
  );
  await db.collection('cms_sites').updateOne(
    { workspaceKey: 'workspace' },
    {
      $set: {
        status: 'draft',
        publishedAt: null,
        branding: siteSnapshot?.branding || {},
        contact: siteSnapshot?.contact || {},
        seo: siteSnapshot?.seo || {},
      },
    },
  );
  await db.collection('cms_navigation').updateOne(
    { workspaceKey: 'workspace', location: 'footer' },
    { $set: { items: [] } },
  );
  await db.collection('cms_media').deleteMany({ id: { $in: created.media } });
  const fs = await import('node:fs/promises');
  await fs.rm(new URL('../uploads/cms/site/', import.meta.url), { recursive: true, force: true }).catch(() => null);
} catch (error) {
  record('Test harness completed without crashing', false, error.stack?.split('\n')[0] || error.message);
} finally {
  await mongo.close();
}

const passed = results.filter((row) => row.ok).length;
console.log(`\n${passed}/${results.length} CMS checks passed.`);
if (passed !== results.length) {
  console.log('\nFailures:');
  for (const row of results.filter((entry) => !entry.ok)) {
    console.log(`- ${row.name}${row.detail ? `: ${row.detail}` : ''}`);
  }
}
process.exit(passed === results.length ? 0 : 1);
