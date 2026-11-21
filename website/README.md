# Stayora — public website

The public, guest-facing site for Stayora: an independent React application in
`website/` that talks to the existing Hostel Management API for room
availability and reservations.

It is **not** part of the dashboard. It has its own `package.json`, its own
dependencies, its own build, and it is deliberately **not** listed in the root
npm workspaces, so `npm run dev`, `npm run build` and `npm test` at the
repository root behave exactly as before.

```text
Stayora/
├── client/     existing management dashboard (untouched)
├── server/     existing Express + MongoDB API
├── website/    ← this app
└── package.json
```

## Requirements

- Node 20+
- The Stayora API running, with MongoDB and seeded demo data
  (`npm run seed` at the repository root)

## Install

```bash
cd website
npm install
cp .env.example .env      # optional; the defaults work locally
```

## Develop

```bash
cd website
npm run dev
```

- Site: <http://localhost:5174>
- API: proxied from `/api` to <http://localhost:4000> by Vite, so there are no
  CORS surprises in development.

The dashboard keeps running on 5173 and can be started separately with the
repository's own `npm run dev`.

## Build

```bash
cd website
npm run build      # static output in website/dist
npm run preview    # serve the build on http://localhost:4174
```

`npm run images` regenerates AVIF and WebP variants for every JPEG in
`public/images` (uses the dev dependency `sharp`). Run it after adding new
photography.

## Environment variables

| Variable         | Default              | Purpose                                                        |
| ---------------- | -------------------- | -------------------------------------------------------------- |
| `VITE_API_URL`   | `/api`               | Base URL the browser uses for API calls.                       |
| `VITE_SITE_SLUG` | `brothers-surf-camp` | CMS site slug the public availability/booking endpoints use.   |
| `VITE_SITE_URL`  | current origin       | Canonical origin for canonical links, Open Graph and JSON-LD.  |

Development reads these from `website/.env` (Vite). They are build-time values,
so set them before `npm run build` in CI/deployment.

## API integration

The site uses three public endpoints. None require a session:

| Endpoint | Used for |
| --- | --- |
| `GET /api/public/sites/:slug/availability?arrival&departure&guests` | Room-level availability, nightly rate, beds free, party total. |
| `POST /api/public/sites/:slug/bookings` | Creates a real reservation request. |
| `GET /api/health` | Not used by the UI; useful when checking a deployment. |

Both booking endpoints live in `server/src/routes/public.js` and delegate to
`server/src/services/booking.js`. That service is the **same** overlap guard,
bed selection and pricing logic the dashboard uses through
`/api/reservations` — the website is a second front door into one reservation
engine, not a second implementation.

`slug` must match a CMS site in the dashboard. The seeded demo site is
`brothers-surf-camp`.

### Booking behaviour

1. The guest picks dates and party size; the site asks the API for availability.
2. The site shows rooms with real rates and remaining beds. No availability is
   hardcoded or simulated.
3. The guest picks a room and enters their details (name, email, phone, country,
   optional notes). A hidden honeypot field rejects bots.
4. `POST /bookings` creates a reservation with:
   - `status: pending`, `paid: 0`, `source: website`, `createdBy: Website`
   - the first free bed in the chosen room (maintenance and overlap checked on
     the server)
   - server-side validation: dates, 30-night and 365-day limits, party size,
     guest details, duplicate protection for 15 minutes
5. The confirmation page shows the real reference (e.g. `STY-00RL0`), room,
   dates, guests and total. It never claims a payment happened.

**There is no online payment.** The team confirms pending website bookings and
takes payment in the dashboard, exactly as they do for other channels. The
confirmation page says so explicitly.

Availability is also used on the homepage and the room detail page, so prices on
the marketing pages are live, not decorative.

## Deployment

The output is a static SPA (`dist/`) that needs history fallback to
`index.html`.

1. Build with production values:

   ```bash
   VITE_API_URL=https://api.example.com/api \
   VITE_SITE_SLUG=brothers-surf-camp \
   VITE_SITE_URL=https://stayora.example \
   npm run build
   ```

2. Serve `dist/` from any static host (Netlify, Vercel, Cloudflare Pages, nginx,
   S3 + CloudFront…). Add a rewrite so unknown paths return `index.html`.
3. Add the website's origin to the API's allowed origins
   (`CLIENT_ORIGINS` in `server/.env`). In development, loopback origins are
   trusted automatically; in production the site's origin must be listed or the
   browser will block the requests.
4. Cache `/assets/*` and the generated images aggressively; `index.html` should
   not be cached.

## Project structure

```text
website/
├── public/
│   ├── images/          photography + generated .avif/.webp variants
│   ├── favicon.svg
│   └── robots.txt
├── scripts/
│   └── optimize-images.mjs
├── src/
│   ├── components/      layout, media, map, availability, lightbox…
│   ├── content/site.js  copy, contact details, surf spots, room imagery
│   ├── lib/             API client, dates/money, SEO, reduced-motion
│   ├── pages/           one component per route
│   ├── styles/          global tokens, homepage scenes, interior pages
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── vite.config.js
└── package.json
```

Routes: `/`, `/accommodation`, `/accommodation/:roomId`, `/experiences`,
`/about`, `/gallery`, `/location`, `/contact`, `/booking`,
`/booking/confirmation`, plus a 404.

## Design and interaction notes

- Palette and typography are defined once as CSS custom properties in
  `src/styles/global.css`. Fraunces (display) and Manrope (body) are loaded from
  Google Fonts.
- The homepage scroll story uses GSAP + ScrollTrigger: hero parallax, masked
  line reveals, a pinned horizontal gallery on desktop, and a parallax closing
  band.
- `prefers-reduced-motion` is respected: GSAP work is skipped, the horizontal
  gallery becomes a native scroll-snap row, and CSS animation is neutralised.
- Animations are also skipped when the tab is hidden, so content is never left
  at an invisible first frame.
- The map is a hand-drawn SVG projected from real coordinates. It needs no
  tiles, keys or third-party scripts; positions are approximate and labelled as
  such.
- Images use `<picture>` with AVIF → WebP → JPEG, explicit dimensions (no layout
  shift), lazy loading below the fold and an eager hero.

## Content to replace before launch

These are intentionally centralised in `src/content/site.js`:

- **Contact details** — `hello@stayora.ma` and `+212 600 000 000` are
  placeholders. Replace with the property's real email/phone/WhatsApp.
- **Coordinates and address** — currently Tamraght village centre
  (30.5064, −9.653).
- **Experiences copy and practical notes** — curated editorial copy; no
  experiences API exists yet, so lesson prices are arranged at the house.
- **Policies** — check-in/out times and payment wording should match the
  property's actual terms.

## Known limitations

- **No contact form endpoint.** The API has no public messaging endpoint, and
  inventing one would need staff-side handling. The contact page therefore
  offers email, phone and WhatsApp links instead of a form that would silently
  drop messages.
- **No online payment.** Bookings are requests; the dashboard confirms them.
- **Long stays and groups** are limited to 30 nights / the room's capacity
  online. The copy points guests to email for anything larger.
- **CMS copy is not consumed.** The public CMS API exists
  (`/api/public/sites/:slug`) but the seeded site is still a draft, so this
  build ships curated copy and uses the API for inventory and bookings only.
  Wiring page sections to published CMS content is a follow-up.
- **Map is illustrative.** It is projected from the spots' coordinates but the
  shoreline is stylised, not survey-accurate.
- **No automated browser test suite** is included for this app; the API has
  `npm run test:booking` in `server/` covering the booking rules end to end.

## Checks run for this build

- `npm run build` in `website/` (Vite production build).
- Dev server on 5174 with the API proxied; all routes load.
- A real booking was created through the UI (`pending`, real reference), shown
  on the confirmation page, then removed from the demo database.
- `npm run test:booking` in `server/` (22 checks) and the existing dashboard
  build/`/cms` page were verified separately.
