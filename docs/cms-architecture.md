# Stayora CMS — Architecture

This document describes the website CMS foundation that ships inside the Stayora
Management Dashboard. It is the reference for the next phases (public website,
per-room content, media on object storage) and for anyone extending the module.

## 1. Where the CMS sits

```
client/ (dashboard, React)          server/ (Express + MongoDB)
  pages/CmsPage.jsx                   routes/cms.js          ← management API (auth)
  features/cms/*                      routes/public.js       ← website API (public)
        │                                    │
        └──────── /api/cms ──────────────────┤
                                             ├─ services/cms/* (business logic)
                                             └─ db/cmsModels.js (content collections)
```

- The CMS is a backend module plus one dashboard section. There is **no second
  frontend application** and no second authentication system.
- Editors use the existing dashboard shell: the same session, the same
  `requirePermission()` middleware, the same audit trail (`services/activity.js`)
  and the same UI kit.
- The future public website is a separate frontend that consumes `/api/public`.
  It needs no database access and no dashboard code.

The module does not touch the reservation engine. Rooms, beds, prices,
availability, reservations and guests remain in their own collections and are
served by their own routes.

## 2. Tenancy and ownership

Stayora's tenancy model today is **one workspace per deployment** (`Setting` key
`workspace`). The CMS reuses it rather than inventing another one:

| Layer | Rule |
| --- | --- |
| Workspace | A server constant (`WORKSPACE_KEY = 'workspace'`). Never read from a request body, query or header. |
| Site | One `cms_sites` document per workspace (`SITE_ID = 'site_main'`), carrying slug, branding, contact, SEO defaults and publication state. |
| Every resource | Stores `workspaceKey` + `siteId`; every read and write filters on both. |

Consequences:

- A caller cannot address another workspace: there is no field to send.
  A `workspaceKey` in a request body is ignored (regression-tested).
- A resource that belongs to another site is **404**, not 403 — its existence is
  not disclosed (regression-tested with a probe document on `site_other`).
- Read access requires the `cms` module permission (owner and manager by
  default). Every write additionally requires the `owner` or `manager` role,
  resolved from the session. Receptionists, accountants and housekeeping cannot
  see or edit the website even if the module were granted to them.

When Stayora grows to several hostels per account, `siteId` becomes the selector:
one site row per hostel website, same models, same routes. No migration of
existing content is required.

## 3. Database models (`server/src/db/cmsModels.js`)

| Collection | Purpose | Key fields |
| --- | --- | --- |
| `cms_sites` | Website configuration | `slug` (unique), `name`, `tagline`, `description`, `status` (`draft`/`published`), `domain`, `locale`, `branding`, `contact`, `seo`, `seededAt`, `publishedAt` |
| `cms_pages` | Page drafts and publication | `title`, `slug` (unique per site), `description`, `status`, `visibility` (`public`/`unlisted`), `systemKey`, `order`, `seo`, `revision`, `published` (snapshot) |
| `cms_sections` | Typed content blocks | `pageId`, `type`, `variant`, `order`, `visible`, `contentVersion`, `content` |
| `cms_media` | Image metadata | `filename`, `storageKey`, `mimeType`, `size`, `width`, `height`, `alt`, `caption`, `folder`, `visibility`, `hash` |
| `cms_navigation` | Menus | `location` (`header`/`footer`, unique per site), `items[]` |

Indexes follow the query patterns: `(siteId, slug)` unique on pages,
`(pageId, order)` on sections, `(siteId, createdAt)` and `(siteId, hash)` on
media, `(siteId, location)` unique on navigation.

**No plaintext binaries, and no operational data.** Media stores metadata only.
Rooms, beds, prices and reservations are referenced by id at most; they are
never copied into CMS collections.

### Section content is data, not schema

`services/cms/sections.js` is a registry of block types (`hero`, `text`,
`image`, `imageText`, `gallery`, `features`, `testimonials`, `cta`, `faq`,
`custom`). Each declares typed fields (text, textarea, url, image, image list,
select, number, boolean, nested list), length limits, required flags and a
version. Writes are validated and normalised server-side:

- unknown section types and unknown content keys are refused/dropped;
- required fields, lengths and numeric ranges are enforced;
- links must be `https://` or site paths (no `javascript:`);
- image references must exist in this site's media library.

Adding a block type is one registry entry plus a renderer on the public site — no
new column, no migration. The dashboard editor is generated from this registry
(`GET /api/cms/section-types`), so new types appear without frontend changes.

Rich text is intentionally plain text. The public payload contains no HTML, so
stored content cannot become stored XSS.

## 4. API structure

### Management — `/api/cms` (authenticated, `cms` permission)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Site, stats, navigation, media folders, storage driver, `canManage` |
| GET | `/meta`, `/section-types` | Editor metadata |
| GET/PATCH | `/site` | Website identity, branding, contact, SEO defaults |
| POST | `/site/publish`, `/site/unpublish` | Website publication |
| GET/POST | `/pages` | List / create |
| POST | `/pages/reorder` | Ordering |
| GET/PATCH/DELETE | `/pages/:id` | Read (with sections) / edit / delete (cascades sections) |
| POST | `/pages/:id/publish`, `/pages/:id/unpublish` | Page publication |
| GET/POST | `/pages/:id/sections` | Section list / create |
| POST | `/pages/:id/sections/reorder` | Section ordering |
| PATCH/DELETE | `/sections/:id` | Content, visibility, order |
| GET/POST | `/media` | Library / upload (base64 JSON, ≤ 5 MB) |
| PATCH/POST/DELETE | `/media/:id`, `/media/:id/replace` | Metadata, replacement, deletion |
| GET | `/media/:id/file` | Authenticated preview (bearer token) |
| GET/PUT | `/navigation`, `/navigation/:location` | Menus |

Responses use `{ data }` like the rest of the API, `Cache-Control: no-store`, a
16 kB body guard for JSON writes and a stricter 8 MB guard for uploads, plus
per-route rate limits (240 reads, 90 writes, 20 uploads per minute per member).

### Public — `/api/public` (no session)

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/sites/:slug` | Site identity, branding, contact, SEO, resolved menus, published page index |
| GET | `/sites/:slug/pages/:pageSlug` | One **published snapshot** + public image map |
| GET | `/sites/:slug/rooms` | Read-only room inventory projection (no guests, no reservations) |
| GET | `/media/:id` | Bytes of a **public** image only |

Public responses are cacheable (`max-age=30`, `stale-while-revalidate=120`),
CORS-open, and require both the site and the page to be published. They contain
no drafts, editor identities, workspace ids, permissions, page ids or private
media ids.

## 5. Publishing workflow

```
edit draft rows ──▶ publish page ──▶ immutable page.published snapshot
                          │                     │
                          │                     └─▶ /api/public serves this
                          └─▶ revision + 1, publishedAt, audit entry
```

1. Pages and sections are edited as drafts (`cms_pages.status = 'draft'`).
2. `POST /pages/:id/publish` re-validates every visible section against the
   current registry, requires every referenced image to be public, then freezes
   `title`, `description`, `visibility`, `seo` and the ordered visible sections
   into `page.published` with an incremented `revision`.
3. Public reads use only that snapshot, so a draft edit never leaks. Editing a
   live page reports `hasUnpublishedChanges` in the dashboard.
4. Unpublishing clears the snapshot and takes the page off the public API.
5. The website itself is published separately (`cms_sites.status`), which is
   what makes `/api/public` answer at all. Unpublishing the website is a
   404 for every public route while all content is kept.

The home page cannot be deleted or unpublished while the site is live; unpublish
the website instead.

## 6. Media architecture

```
dashboard ──base64 JSON──▶ /api/cms/media ──▶ imageProbe (bytes, not headers)
                                   │
                                   ├─ cms_media  (metadata only)
                                   └─ mediaStorage().put(key, buffer)
                                          │
                                          └─ local driver → server/uploads/cms/site/<random>.<ext>
```

- Uploads are limited to PNG, JPEG, WebP and GIF; the type and dimensions are
  read from the file bytes (`lib/imageProbe.js`), never from the client.
- 5 MB per image, validated in the service and guarded at the route.
- `services/cms/mediaStorage.js` is the only place that touches bytes. Switching
  to S3/R2 means implementing `put`/`get`/`remove` in a second driver and setting
  `CMS_MEDIA_DRIVER`; models, routes and the dashboard are unchanged. An unknown
  driver fails with 503 instead of silently writing to disk.
- Deletion is refused while any draft, snapshot or branding token references the
  image (409 with the referencing pages). Making a referenced published image
  private is refused for the same reason.
- Public images are served by `/api/public/media/:id`; private ones 404 there and
  remain visible only through the authenticated preview route.
- Dashboard previews are fetched with the bearer token and rendered from a blob
  URL, so no `<img src>` ever relies on an unauthenticated path.

## 7. Public website integration strategy

The website (later phase) is a separate application that:

1. reads `GET /api/public/sites/:slug` for identity, branding, menus and the
   page index;
2. reads `GET /api/public/sites/:slug/pages/:slug` per route and renders the
   returned `sections` with its own components, using the `media` map for images;
3. calls the **existing core API** for availability, rates and bookings;
4. never reads MongoDB and never receives a draft, a credential or an internal
   field.

Because public endpoints are versionless JSON with stable section shapes, mobile
and desktop clients can consume the same contract later. Business rules
(validation, publication, tenancy) stay on the server; the dashboard contains
presentation only.

## 8. Security considerations

- **Authentication**: existing JWT bearer sessions. No cookies, so no CSRF
  surface on management writes.
- **Authorization**: module permission + owner/manager role on every write,
  enforced server-side; the UI's `canManage` flag is informational only.
- **Tenant isolation**: server-resolved workspace and site scope on every query;
  client-supplied identifiers are ignored; cross-site ids are 404.
- **Validation**: strict allow-lists for page fields, section types/keys, menu
  items, colours, fonts, domains, slugs (reserved list included) and image
  references; body sizes capped; JSON only.
- **Uploads**: byte-level type sniffing, size limit, random storage keys,
  `X-Content-Type-Options: nosniff` on served files, no path traversal
  (`storageKey` is validated and resolved inside the storage root).
- **Publishing**: drafts never leave the server; publishing re-validates and
  requires public images; the snapshot is the only public source.
- **Audit**: `cms.page_created`, `cms.page_updated`, `cms.page_published`,
  `cms.page_unpublished`, `cms.page_deleted`, `cms.section_*`,
  `cms.media_uploaded/updated/replaced/deleted`, `cms.branding_updated`,
  `cms.navigation_updated`, `cms.site_published/unpublished`. Entries carry
  ids, counts and field names — never content, markup or image bytes.
- **Rate limiting**: in-process fixed windows, like the integrations module.
  Pair with an edge limiter when running more than one instance.

## 9. Verification

```bash
cd server && npm run test:cms   # 56 checks: auth, roles, tenancy, validation,
                                # publishing snapshots, media, navigation,
                                # branding, audit hygiene, public boundary
cd server && npm run smoke      # existing operational suite (unchanged)
cd client && npm run build
```

The CMS suite restores the demo site to its draft state when it finishes.

## 10. Deliberately not in this phase

- The public website itself, and any rendering components for it.
- Mobile and desktop clients.
- Per-room editorial content mapping (rooms stay Core data; a room content model
  can be added later without touching pages or sections).
- Revision history beyond the published snapshot, scheduling, previews with
  share links, localisation of content, and object storage credentials.
