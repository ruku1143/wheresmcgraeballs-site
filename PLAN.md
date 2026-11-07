# Where's MC Graeballs? — Implementation Plan

A joke "Where's Wally" style tracker. Locals open the site, drop a "last seen" pin for MC Graeballs on a 2D map of Basingstoke, and everyone sees the sightings, a "last seen" banner with a status, a hotspot heatmap and a spotter leaderboard.

**Domain:** wheresmcgraeballs.co.uk
**Repo:** GitHub
**Hosting:** a single Cloudflare Worker (wrangler) serving both the static frontend and the API
**Storage:** Cloudflare D1 (free plan)

---

## 1. Decisions already made

| Topic | Decision |
|---|---|
| Map | Real map: Leaflet + tiles, Basingstoke-centred and bounded |
| Look | Clean and minimal. The joke carries the site, not heavy theming |
| Anti-abuse | Cloudflare Turnstile + per-IP rate limiting. Sightings go live instantly |
| v1 features | Last-seen banner with status, sighting details (activity + note), leaderboard, heatmap |
| Not in v1 | Photo uploads (would need R2 plus moderation), user accounts |

## 2. Storage: why D1

| Option | Verdict |
|---|---|
| **D1 (SQLite)** | **Use this.** It is relational, queryable (latest sighting, leaderboard, heatmap) and consistent. Free plan: 5M rows read/day, 100k rows written/day, 5 GB storage, 500 MB per database. This is far beyond what a joke site for friends needs. |
| Workers KV | No. Only 1,000 writes/day, eventually consistent, and no queries. |
| R2 | Not needed until photo uploads exist. |
| Durable Objects | Overkill. Real-time push isn't needed. Polling every 60s is fine. |

Notes for the implementer:
- Since 1 Sept 2026, D1 queries on the Free plan **fail** once the daily row limits are exceeded. The API must catch D1 errors and return a friendly "Graeballs is hiding, try later" response instead of a 500 stack trace.
- Rows-read counts rows *scanned*, so add indexes and always use `LIMIT`.
- Cache `GET /api/sightings` at the edge for ~30s (`caches.default`) to protect read quota and speed things up.
- Static asset requests to Workers are free, so only `/api/*` calls count towards the 100k requests/day Worker limit.

## 2b. Hard constraint: Cloudflare Free plan only

Everything must run on the **Workers Free plan with no payment method attached**. On Free, hitting a limit makes requests fail. It never bills. Don't add anything that needs the $5 Workers Paid plan.

**Allowed (all free):**
- Workers (Free): 100k requests/day, 10 ms CPU per invocation. Awaiting `fetch()` to Turnstile doesn't count as CPU time. Keep JSON work small.
- Workers Static Assets: static file requests are free.
- D1 (Free): limits in §2.
- Turnstile: free. Use the managed widget.
- Custom Domains on Workers: free, provided the zone is on Cloudflare (a free DNS zone is fine).
- Cache API (`caches.default`): free.
- Workers Logs/observability: free (200k events/day, 3 days retention).
- Free universal SSL.

**Do NOT use:**
- R2: needs a payment method on file even for its free tier, so there are no photo uploads in v1.
- Durable Objects, Queues, Hyperdrive, Workers AI, Images, Logpush, Workers Paid-only features.
- The Workers Rate Limiting binding. Rate limit with D1 as specified in §5 instead.
- Cloudflare Web Analytics or WAF rate-limiting rules beyond what the free zone already includes.

**Design for the limits:**
- Cap CPU per request: no heavy loops, no big JSON transforms. The `limit` caps in §5 and the edge caching exist for this reason.
- Prune old data: a daily Cron Trigger (Cron Triggers are free) deleting rows older than 12 months, or keep it simple and skip pruning because 500 MB is enormous for this.
- On D1 or Worker limit errors, show a friendly "Graeballs is resting, try again tomorrow" message.
- Add a README checklist: "Billing page shows $0; no paid add-ons enabled."

## 3. Architecture

```
Browser (Leaflet SPA, vanilla TS)
   │  static files            ┌──────────────────────────────┐
   ├─────────────────────────►│ Cloudflare Worker             │
   │  /api/*  (JSON)          │  • Static Assets binding      │
   └─────────────────────────►│  • Hono router (TypeScript)   │
                              │  • D1 binding (DB)            │
                              │  • Turnstile siteverify call  │
                              └──────────────────────────────┘
```

- One Worker using the **Workers Static Assets** feature (`assets.directory = "./public"`), with the Worker script handling `/api/*` only.
- **Hono** for routing. **Vite** (vanilla TS, no framework) to bundle the frontend into `public/`. Leaflet and `leaflet.heat` come from npm, not a CDN.
- No SSR and no framework. Keep it small.

### Repo layout

```
/
├─ PLAN.md
├─ README.md
├─ wrangler.jsonc
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ migrations/
│   └─ 0001_init.sql
├─ src/
│   ├─ worker/           # Worker code
│   │   ├─ index.ts      # Hono app, route wiring
│   │   ├─ sightings.ts  # handlers
│   │   ├─ turnstile.ts  # siteverify helper
│   │   ├─ ratelimit.ts
│   │   ├─ validate.ts   # input validation + bbox
│   │   └─ status.ts     # status calculation
│   └─ web/              # Frontend
│       ├─ index.html
│       ├─ main.ts
│       ├─ map.ts
│       ├─ api.ts
│       └─ styles.css
├─ test/
└─ .github/workflows/    # only if using Actions (see §8)
```

## 4. Data model (`migrations/0001_init.sql`)

```sql
CREATE TABLE sightings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lat         REAL    NOT NULL,
  lng         REAL    NOT NULL,
  place_name  TEXT,                    -- optional, user supplied, max 60 chars
  activity    TEXT    NOT NULL,        -- one of the fixed enum values below
  note        TEXT,                    -- optional, max 140 chars
  nickname    TEXT,                    -- optional spotter name, max 24 chars
  created_at  INTEGER NOT NULL,        -- unix seconds, UTC
  ip_hash     TEXT    NOT NULL,        -- salted SHA-256, never raw IP
  hidden      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sightings_visible_time ON sightings (hidden, created_at DESC);
CREATE INDEX idx_sightings_nickname     ON sightings (nickname) WHERE hidden = 0;
CREATE INDEX idx_sightings_ip_time      ON sightings (ip_hash, created_at);
```

**Activity enum** (dropdown, validated server-side, easy to extend):
`vibing`, `on the mic`, `in the Malls`, `waiting for a bus`, `lost`, `at the pub`, `bare mysterious`, `other`

## 5. API

All responses are JSON. All writes validate server-side.

### `GET /api/sightings?limit=200`
- Returns non-hidden sightings, newest first, with `limit` capped at 500.
- Response includes the server-calculated `status` so the client and server never disagree.
- Edge-cached for ~30s.

### `GET /api/latest`
Returns the most recent sighting plus its computed status, for the banner.

### `POST /api/sightings`
Body: `{ lat, lng, place_name?, activity, note?, nickname?, turnstileToken }`

Server steps, in order:
1. Verify the Turnstile token with `https://challenges.cloudflare.com/turnstile/v0/siteverify` using the `TURNSTILE_SECRET` secret and the `CF-Connecting-IP` header. Reject on failure.
2. Rate limit by `ip_hash`: max **3 sightings per 10 minutes** and **20 per day**. Count rows from `idx_sightings_ip_time`. Return `429` with a friendly message.
3. Validate:
   - `lat`/`lng` are numbers **inside the Basingstoke bounding box** (see §6). Reject pins in the sea, in Australia, and so on.
   - `activity` is in the enum.
   - Lengths are capped. Trim whitespace and strip control characters.
   - Optional light word filter on `note`, `place_name` and `nickname`.
4. Insert with a parameterised query (`.bind()`). Never concatenate SQL.
5. Return `201` with the new sighting.

### `GET /api/leaderboard`
Top 10 spotters:
```sql
SELECT nickname, COUNT(*) AS sightings
FROM sightings
WHERE hidden = 0 AND nickname IS NOT NULL
GROUP BY nickname ORDER BY sightings DESC LIMIT 10;
```
Edge-cache for 5 minutes.

### `GET /api/heatmap`
Returns `[lat, lng]` pairs for the latest 1,000 visible sightings. Edge-cache for 5 minutes.

### Admin (kill switch)
- `POST /api/admin/hide/:id` and `POST /api/admin/unhide/:id`.
- Requires `Authorization: Bearer <ADMIN_TOKEN>` (a Wrangler secret). Compare with a constant-time check.
- No admin UI in v1. A `curl` one-liner is documented in the README.

## 6. Map and frontend behaviour

- **Library:** Leaflet. **Heatmap:** `leaflet.heat`, toggled by a layer control.
- **Centre:** Basingstoke town centre, about `[51.2665, -1.0870]`, zoom 14.
- **Bounds:** use `maxBounds` and the same box server-side. Starting point is roughly lat `51.22–51.31`, lng `-1.17 – -1.00`. Tune it to include Chineham, Winklebury, Popley, Hatch Warren and Old Basing. Keep the constants in one shared file used by both the frontend and the Worker.
- **Tiles:** use a light, minimal basemap to fit the clean style. Preferred: CARTO "Positron" (free for light use, needs attribution). Fallback: standard OpenStreetMap tiles. Both need visible attribution. Don't hammer OSM's volunteer tile servers. Make the tile URL a config constant so it can be swapped easily.
- **Pins:** a custom marker for each sighting. Colour or opacity fades with age, with the newest pin emphasised. Clicking a pin opens a popup with the activity, note, place name, nickname and relative time ("12 min ago").
- **Add a sighting:** a prominent "I saw him!" button. Click the button, then tap or click the map to drop a pin, or use "use my location". Opens a small form with activity dropdown, optional note, place name and nickname, plus the Turnstile widget and Submit. Show success and error states.
- **Banner (top of page):** "Last seen **23 minutes ago** near *the Malls* — 🔥 Hot", with the status derived as below.
- **Status logic** (`status.ts`, shared by Worker and UI):

  | Age of latest sighting | Status |
  |---|---|
  | < 1 hour | Hot |
  | < 6 hours | Warm |
  | < 24 hours | Cool |
  | < 7 days | Cold |
  | ≥ 7 days or none | Missing — "Presumed on tour" |

  Playful copy for each is welcome. Keep it dry rather than cartoonish.
- **Leaderboard:** a small panel or drawer showing the top spotters.
- **Refresh:** poll `/api/sightings` and `/api/latest` every 60s while the tab is visible (`visibilitychange`).
- **Times:** store UTC, display in Europe/London.
- **Mobile first.** Most friends will use this on a phone. Make tap targets large and the form usable one-handed.
- **Safety:** render all user text with `textContent` or escape it. Never use `innerHTML` with user data.
- **Footer:** a short "It's a joke. MC Graeballs is fictional. Don't be weird." line, a map attribution, and a privacy note (IP addresses are stored only as salted hashes, for rate limiting).

## 7. Security and privacy checklist

- [ ] Turnstile verified server-side on every POST
- [ ] Per-IP rate limiting (hashed IP, daily-rotating salt or a long salt in a secret)
- [ ] Strict bbox, enum and length validation on the server
- [ ] Parameterised SQL only
- [ ] Output escaping; a CSP header allowing only self, the tile host, and Turnstile (`challenges.cloudflare.com`)
- [ ] Standard security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` with geolocation allowed for self)
- [ ] Secrets only via `wrangler secret put` (`TURNSTILE_SECRET`, `ADMIN_TOKEN`, `IP_HASH_SALT`). Nothing in the repo
- [ ] CORS restricted to the site's own origin (same-origin API, so none needed)
- [ ] D1 errors caught and returned as friendly messages

## 8. Deployment

### Cloudflare prerequisites (manual, for Luke)
1. `wheresmcgraeballs.co.uk` must be a zone on Cloudflare (nameservers pointed at Cloudflare at the registrar), so the Worker can use it as a Custom Domain.
2. Create a Turnstile widget for the domain. Note the **site key** (public, goes in frontend config) and **secret key** (a secret).
3. Create the D1 database: `npx wrangler d1 create graeballs-db`, then put the returned `database_id` in `wrangler.jsonc`.

### `wrangler.jsonc` (outline)
```jsonc
{
  "name": "wheres-mc-graeballs",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-11-01",
  "assets": { "directory": "./public", "not_found_handling": "single-page-application" },
  "d1_databases": [
    { "binding": "DB", "database_name": "graeballs-db", "database_id": "<fill in>", "migrations_dir": "migrations" }
  ],
  "routes": [
    { "pattern": "wheresmcgraeballs.co.uk", "custom_domain": true },
    { "pattern": "www.wheresmcgraeballs.co.uk", "custom_domain": true }
  ],
  "observability": { "enabled": true }
}
```
Note: API routes (`/api/*`) must reach the Worker before the SPA fallback. Use `assets.run_worker_first: ["/api/*"]` (check the current wrangler docs for the exact key).

### CI/CD from GitHub
Recommended (free, and fully under your control): a **GitHub Actions** workflow using `cloudflare/wrangler-action` on pushes to `main`, with `CLOUDFLARE_API_TOKEN` (scoped to Workers and D1 edit) and `CLOUDFLARE_ACCOUNT_ID` as repo secrets. Steps: `npm ci` → `npm test` → `npm run build` → `wrangler d1 migrations apply graeballs-db --remote` → `wrangler deploy`. Actions is free for public repos and has a free monthly allowance on private ones.

Alternative: Cloudflare **Workers Builds** (connect the repo in the dashboard). It has a free tier with limited build minutes, so check the current allowance before relying on it.

### Local development
- `npm run dev`: Vite plus `wrangler dev` with a local D1 (`wrangler d1 migrations apply graeballs-db --local`).
- Use Cloudflare's Turnstile **test keys** locally (always-pass site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`).
- Seed script (`npm run seed`) inserting ~15 fake sightings around Basingstoke so the map, heatmap and leaderboard can be developed.

## 9. Testing

- Unit tests (Vitest): status calculation, bbox validation, input sanitising, rate-limit logic.
- Worker integration tests with `@cloudflare/vitest-pool-workers` against a local D1: POST happy path, bad Turnstile, out-of-bounds pin, rate limit hit, hidden sightings excluded from reads.
- Manual check on a real phone: add a pin, geolocation prompt, form usability, banner updating.

## 10. Build order for Claude Code

1. Scaffold the repo: TypeScript, Hono, Vite, wrangler config, lint and format. Add a README stub.
2. D1 migration and the seed script.
3. Worker API (`GET` endpoints first, then `POST` with validation). Add Turnstile and rate limiting.
4. Frontend map with pins, popups, and the banner and status logic.
5. "I saw him!" flow with the form and Turnstile.
6. Heatmap layer and leaderboard panel.
7. Polish: mobile layout, empty states ("No sightings yet. Suspicious."), error states, footer, favicon, social preview image.
8. Security headers and CSP.
9. Tests.
10. Deploy: custom domain, secrets (`wrangler secret put TURNSTILE_SECRET`, `ADMIN_TOKEN`, `IP_HASH_SALT`), remote migration, smoke test on the live domain.
11. README: how to run locally, deploy, and hide a sighting with curl.

## 11. Acceptance criteria

- A visitor on a phone can add a sighting in under 20 seconds.
- The banner shows the correct age and status of the newest visible sighting.
- Pins outside Basingstoke are rejected by the server.
- A 4th submission within 10 minutes from the same IP gets a friendly 429.
- Hidden sightings never appear on the map, heatmap or leaderboard.
- The site runs entirely on the Cloudflare Free plan with no payment method attached, and uses none of the "Do NOT use" products in §2b.

## 12. Open items for Luke

- **Spotter nicknames:** free text (needs the word filter) or a fixed list of friends?
- **Where on Cloudflare is the domain registered or pointed today?** Required for the Custom Domain step.
- **Exact map bounds:** confirm the borders of "Basingstoke" for the pin box (suburbs, Old Basing, Chineham, etc.).
- **Image of MC Graeballs:** supply a logo or avatar for the favicon and pin, or use a generic emoji pin for now.
