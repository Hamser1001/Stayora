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
