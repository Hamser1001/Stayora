# Stayora — Scalability & Performance Report

**Date:** 16 November 2026
**Scope:** Express + MongoDB API (`server/`), the React client's data layer, a 41k-document dataset, load/stress testing and integrity checks.
**Constraint honoured:** MongoDB stays the datastore, the architecture (Express + Mongoose + REST adapter) is unchanged, and every existing screen and workflow is preserved.

---

## 1. Dataset

Generated with `npm run seed:large` (`server/src/db/seedLarge.js`) — deterministic, interconnected, and sized inside the requested 30k–50k band:

| Collection | Documents | Notes |
|---|---:|---|
| reservations | 20,573 | 2.7 years of stays, non-overlapping per bed, denormalised guest/room/bed labels + `paid` |
| payments | 17,575 | every payment/refund tied to a real reservation, guest and room |
| guests | 900 | realistic names, nationalities, contact details |
| expenses | 666 | 31 months, 9 categories |
| tasks | 900 | linked to real rooms and housekeeping staff |
| notifications | 300 | reference real reservations |
| beds | 237 | belonging to 60 rooms |
| rooms | 60 | 6 floors, 7 room types |
| staff | 7 | demo login unchanged (`hamza@stayora.app` / `stayora2026`) |
| **Total** | **41,218** | covered by `GET /api/…` and the UI |

Date span: ~520 days of history plus ~430 days of forward bookings, so dashboards, reports and the calendar all have current data.

---

## 2. Root cause found

Every read endpoint called `loadSnapshot()`, which loaded **all** collections (including every reservation and payment) on **every request**, then filtered, sorted and paginated in JavaScript. With the larger dataset that meant:

- **~15.4 s** per request for `GET /reservations` (measured against the old build with the same dataset).
- ~4 MB–8 MB transferred from the database per request, per user.
- Full collection scans, O(beds × reservations) status calculations, and no index use for list sorting/filtering.
- Unbounded payloads: the client received all 20,573 reservations and paginated in memory.

---

## 3. What changed

### Query layer

- **Pagination contract** — list endpoints accept `page`, `pageSize` (max 100), `sort`, `direction` and return `{ data, meta: { page, pageSize, total, pages, counts } }`. The client renders one page and uses `meta.total` for counts.
- **Indexed filters and sorts** — reservations (`status+arrival`, `guestId+arrival`, `bedId+arrival+departure`, `arrival+id`, `createdAt`, `roomId+…`), payments (`date+createdAt`, `method+date`), expenses (`date`, `category+date`), guests (`name`), tasks, notifications.
- **Denormalised read model** — reservations store `guestName`, `roomNumber`, `bedLabel` and `paid`; payments store `guestName`, `reservationReference`, `roomNumber`. List rendering, search and sorting no longer need joins. Write paths keep them in sync (guest rename and room renumber propagate with `updateMany`; payments update `reservation.paid`).
- **Aggregation instead of loading** — dashboard/report metrics, payment summaries, expense breakdowns, outstanding balances, status counters and guest rollups are computed in MongoDB (`$group`, `$facet`, `$expr`).
- **Bounded reads** — the analytics layer loads only reservations overlapping the requested window plus today's live stays (was: every active/future booking); rooms load a 45-day look-ahead instead of all future bookings; notifications are `limit(40)`; the payment picker uses an indexed outstanding query (max 500).
- **Projections** — analytics reads only the fields the selectors use.
- **O(1) ids** — a `counters` collection replaces "scan every id to find the max" on writes (seeded/initialised automatically).
- **Single-pass bed index** — bed status/enrichment groups reservations by bed once instead of filtering the whole list per bed.
- **Small TTL read caches** (`services/cache.js`, 4–30 s) for reference collections, counters, guest rollups and the analytics window; **every non-GET request invalidates them**, so the UI never shows stale data after a write.

### API behaviour

- Same routes, same response shapes for single documents; list responses add `meta` (the client adapter unwraps it).
- `GET /guests/options` — projected picker list (900 guests, no history).
- `GET /reservations/outstanding` — balance-carrying reservations for the payment dialog.
- List mode omits a guest's stay history (still available from `GET /guests/:id`, which the profile sheet uses) — this alone cut the guests page payload from **312 kB to 31 kB**.

### Frontend

- Reservations, Guests, Payments and Expenses now drive pagination, sorting, filters and search through the API (`listPage`) instead of fetching everything; search is debounced (300 ms) so typing doesn't fire a request per keystroke.
- Skeletons only show on the first load of a screen; page/filter changes keep the current table visible.
- Guest profile and reservation detail fetch the single document they need; the reservation form uses the lightweight guest option list.
- Build passes (`npm run build`).

---

## 4. Query plans (EXPLAIN evidence)

`npm run audit:queries` prints the winning plan for the hot paths. All are index scans with small key counts:

| Query | Plan | Keys examined / docs returned | Time |
|---|---|---:|---:|
| Reservations: status filter + arrival sort + page | `IXSCAN(arrival_-1_id_-1)` | 21 / 12 | 0 ms |
| Reservations: count by status | `IXSCAN(status_1)` | 24 / 24 | 0 ms |
| Reservations: month overlap (calendar) | `IXSCAN(status_1_arrival_-1)` | 11,166 / 820 | 53 ms |
| Reservations: guest stays | `IXSCAN(guestId_1_arrival_-1)` | 37 / 37 | 0 ms |
| Payments: date range, newest first | `IXSCAN(date_-1_createdAt_-1)` | 25 / 25 | 0 ms |
| Expenses: date range, newest first | `IXSCAN(date_1)` | 6 / 6 | 0 ms |
| Guests: name prefix search | `IXSCAN(name_1)` | 66 / 12 | 0 ms |
| Notifications: newest first | `IXSCAN(createdAt_-1)` | 40 / 40 | 0 ms |

No collection scans remain on list, detail, dashboard or report paths.

---

## 5. Load & stress results

`cd server && node scripts/load-test.js --requests=150 --concurrency=20 --stress` (keep-alive sockets, warm server, remote Atlas cluster). Raw results: `server/scripts/load-test-results.json`.

### Per-endpoint, 150 requests at 20 concurrent clients

| Scenario | p50 | p95 | p99 | Throughput | Payload |
|---|---:|---:|---:|---:|---:|
| Reservations list | 481 ms | 920 ms | 1841 ms | 34 rps | 13.4 kB |
| Reservations search + status filter | 495 ms | 898 ms | 1013 ms | 39 rps | 13.3 kB |
| Guests list | 149 ms | 836 ms | 884 ms | 52 rps | 30.9 kB |
| Payments list (month) | 77 ms | 900 ms | 1077 ms | 52 rps | 8.2 kB |
| Expenses list (month) | 66 ms | 902 ms | 1858 ms | 50 rps | 1.4 kB |
| Dashboard | 603 ms | 724 ms | 888 ms | 32 rps | 26 kB |
| Reports | 390 ms | 483 ms | 545 ms | 52 rps | 3.1 kB |
| Rooms & beds | 964 ms | 1038 ms | 1054 ms | 22 rps | 93.2 kB |
| Calendar (month) | 816 ms | 941 ms | 967 ms | 29 rps | 368 kB |
| Notifications | 56 ms | 537 ms | 545 ms | 162 rps | 8.1 kB |
| Settings | 55 ms | 780 ms | 797 ms | 84 rps | 0.5 kB |
| **Mixed browsing** | **574 ms** | **1228 ms** | **1723 ms** | **33 rps** | 29 kB |

**0 failures** across 1,800 requests.

### Single-request (warm) latency, after

Reservations 108–190 ms · reserves page 2 111 ms · guests 142 ms · payments 57 ms · expenses 56 ms · notifications 52 ms · reports 85 ms · dashboard 600–1000 ms (first call; then cached window) · rooms 360 ms · calendar 250 ms.

### Stress ramp (mixed traffic)

| Concurrent clients | p50 | p95 | Throughput |
|---:|---:|---:|---:|
| 10 | 148 ms | 713 ms | 36 rps |
| 25 | 700 ms | 1129 ms | 38 rps |
| 50 | 1001 ms | 2678 ms | 40 rps |
| 100 | 1921 ms | 3995 ms | 45 rps |

---

## 6. Bottleneck analysis

The API process is not the limit: CPU stays low while latency grows with concurrency, and throughput plateaus around **~40 requests/s** even at 100 clients. The limiting factor is the **remote MongoDB Atlas cluster and the round-trip latency to it** (55–110 ms RTT from this machine; every list request needs 2–3 sequential round trips, and analytics needs 5–6 in parallel). Requests are therefore latency-bound, not CPU- or query-plan-bound.

What this means and the next steps, in order of impact:

1. **Move the API next to the database** (same region/zone as Atlas). This removes the dominant RTT; the same code should reach low tens of ms p50.
2. **Upgrade the Atlas tier / use a replica set read preference** for analytics if the cluster is a free/shared tier — per-request grouping over 20k reservations still costs tens of ms of server CPU.
3. **Run more than one Node process** behind a load balancer (the TTL caches are per process, which is fine and now invalidated by writes only in the process that served them — a cross-process cache flush would be the follow-up if this is scaled horizontally).
4. **Add HTTP caching** (`ETag`/`Cache-Control` or a Redis layer) for the dashboard/reports endpoints, which are the heaviest reads and change slowly.
5. Calendar returns 368 kB for a month; if it grows, add a lightweight projection mode for the grid view.

Remaining knowingly accepted trade-offs:

- Counters/guest rollups/analytics are cached for 4–15 s (invalidated on any write in the same process).
- The rooms board reads 45 days of arrivals to show "next arrival"; older future bookings are not reflected in that single field.
- Guest list payload omits stay history (profile endpoint includes it).
- Sorting the guest list by totals uses the cached rollups, so it can be up to 15 s behind a brand-new payment.

---

## 7. Integrity & stability

`npm run smoke` (or `node scripts/smoke.js`) — **39/39 checks pass**:

- Dataset size 39,345 documents (rooms/beds/guests/reservations/payments; 41,218 including expenses/tasks/notifications/staff).
- No orphan reservations (guest/room/bed) and no orphan payments.
- `reservation.paid` equals the payment ledger on a 300-reservation random sample.
- No overlapping reservations per bed (full aggregation check over 20,573 stays).
- Required indexes present; id counters initialised.
- Every endpoint returns 200 with the expected shape and bounded page size.
- Write path verified end-to-end: create guest → find availability → create reservation → take payment → check-in → `paid` reflects the ledger → cleanup.

Stability under load: 1,800 requests at 20 concurrent clients with zero failures after the fixes (the earlier run exposed a cache race in the new analytics cache — fixed by serving in-flight promises only once resolved).

---

## 8. How to reproduce

```bash
cd server
npm run seed:large        # 41k interconnected documents (replaces the workspace)
npm run audit:queries     # EXPLAIN plans for the hot queries
npm run smoke             # integrity + API checks
npm run dev               # start the API

node scripts/load-test.js --requests=150 --concurrency=20 --stress
node scripts/profile-analytics.js   # per-query timings behind dashboard/reports
```

Demo login: `hamza@stayora.app` / `stayora2026`.
