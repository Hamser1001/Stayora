# Stayora API

Express + MongoDB backend for the Stayora hostel operations app. It implements the
same contract the client uses with its seeded demo adapter, so the UI switches to
this API by changing one env var.

## Setup

```bash
cp server/.env.example server/.env   # then edit MONGODB_URI / JWT_SECRET
npm install                          # from the repo root (workspaces)
npm run seed                         # loads the demo hostel into MongoDB
npm run dev:api                      # http://localhost:4000/api
```

Demo sign-in: `hamza@stayora.app` / `stayora2026`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev:api` | Start the API with `node --watch` |
| `npm run seed --workspace server` | Drop and reload the demo workspace |
| `npm run start --workspace server` | Start without watch (production-style) |

## Endpoints

All responses are wrapped as `{ "data": … }`; errors return `{ message, code }`
with a matching HTTP status.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Rooms | `GET/POST /rooms`, `GET/PATCH/DELETE /rooms/:id`, `PATCH /beds/:id` |
| Guests | `GET/POST /guests`, `GET/PATCH /guests/:id` |
| Reservations | `GET/POST /reservations`, `GET/PATCH /reservations/:id`, `PATCH /reservations/:id/status`, `GET /reservations/calendar`, `GET /reservations/availability` |
| Payments | `GET/POST /payments`, `POST /payments/refunds`, `GET /payments/summary` |
| Expenses | `GET/POST /expenses`, `DELETE /expenses/:id`, `GET /expenses/summary` |
| Housekeeping | `GET/POST /housekeeping`, `PATCH /housekeeping/:id` |
| Staff | `GET/POST /staff`, `PATCH/DELETE /staff/:id` |
| Insights | `GET /dashboard`, `GET /reports`, `GET/PATCH /settings`, `POST /settings/reset` |
| Notifications | `GET /notifications`, `POST /notifications/read-all` |
| Health | `GET /health` |

Writes require `Authorization: Bearer <token>` from `POST /auth/login`; reads are
open. Business rules (bed overlap, payment caps, status transitions, owner locks)
mirror the client's mock adapter.

## Structure

```
src/
  app.js            Express app (middleware + routes)
  index.js          boot: connect MongoDB, listen
  config/env.js     env parsing
  db/               Mongoose models, connection, seed data + seeder
  lib/dates.js      shared date helpers
  services/         selectors (metrics/enrichment) and snapshot loader
  middleware/       auth (JWT), errors
  routes/           auth, inventory, reservations, finance, operations, insights
```

Reads load the (small) workspace as plain arrays and reuse the metric selectors, so
dashboard/report numbers match the client exactly. Writes go through Mongoose.
Settings live in a single `settings` document keyed `workspace`; resetting reseeds
every collection.

## Connecting the client

```bash
# client/.env
VITE_API_MODE=http
VITE_API_URL=http://localhost:4000/api
```

Then restart `npm run dev`. The UI talks to the API through `src/api/adapter.http.js`
without any page changes.

## Integrations

Booking-channel and developer integrations live in `src/services/integrations/` and
are exposed at `/api/integrations`.

**Credentials are server-side only.** Values are sealed with AES-256-GCM before they
are written to the `integrations` collection, and no endpoint can return them — the
API only ever sends provider metadata, connection status, timestamps and non-secret
configuration (`propertyId`, `callbackUrl`). There is no reveal-secret feature.

```bash
# 32 bytes, base64 or hex. Use a managed secret in production.
INTEGRATION_ENCRYPTION_KEY=...
# or point at a mounted secret instead:
INTEGRATION_ENCRYPTION_KEY_FILE=/run/secrets/stayora-integration-key
# optional, defaults to v1; bump after rotating to a new key
INTEGRATION_KEY_VERSION=v1
```

If neither variable is configured the API **fails closed**: reads still work so the
Integrations page can explain the problem, but every credential write
returns 503 and nothing is stored. There is no plaintext fallback.

Access rules: reading requires the `integrations` module permission (owner and
manager by default). Storing, rotating, revoking and enabling credentials requires
the **owner** role — resolved from the server session, never from the request body.

Endpoints:

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/integrations` | Catalog + status metadata |
| GET | `/api/integrations/:provider` | One provider |
| POST | `/api/integrations/:provider/credentials` | Owner only, 16 kB limit, audited |
| POST | `/api/integrations/:provider/rotate` | Re-encrypts stored values |
| DELETE | `/api/integrations/:provider/credentials` | Revoke |
| PATCH | `/api/integrations/:provider` | Enable / disable |
| POST | `/api/integrations/:provider/test` | Connection attempt (never claims an unverified channel) |
| POST | `/api/integrations/inbound/:provider` | Signed inbound events (no session) |

Inbound events must send `X-Stayora-Timestamp` (unix seconds), `X-Stayora-Signature`
(hex HMAC-SHA256 of `${timestamp}.${rawBody}`) and `X-Stayora-Event-Id`. Timestamps
older than five minutes are rejected and event ids are unique per provider, so
replays are no-ops. Providers without a documented scheme answer 501.

Booking.com is prepared but not live: partner access is required before Stayora can
synchronize reservations, availability or rates, so a stored token reports
"Pending approval" rather than "Connected".

```bash
npm run test:integrations   # 36 security regression checks
```

## Website CMS

The website CMS lives in `src/services/cms/` (content, sections, media, navigation,
public API) with routes in `src/routes/cms.js` (management) and `src/routes/public.js`
(public website). Content is stored in the `cms_*` collections; media binaries are
written by `services/cms/mediaStorage.js` outside MongoDB (`server/uploads/cms` by
default, `CMS_MEDIA_DRIVER`/`CMS_MEDIA_LOCAL_DIR` override it).

Run `npm run test:cms` for the CMS security suite. Architecture, publishing model,
API surface and security rules are documented in `../docs/cms-architecture.md`.
