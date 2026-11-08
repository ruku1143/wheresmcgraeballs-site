# Where's MC Graeballs?

A joke "Where's Wally" tracker for Basingstoke. Drop a "last seen" pin, see the banner status, the hotspot heatmap and the spotter leaderboard. **It's fictional. Don't be weird.**

Runs as one Cloudflare Worker (Hono API + static Leaflet frontend) with a D1 database, entirely on the **Workers Free plan**. See [PLAN.md](PLAN.md) for the design.

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars   # Turnstile test secret + dev secrets
npm run db:local                 # apply migrations to local D1
npm run seed                     # ~15 fake sightings
npm run dev                      # build + wrangler dev on http://localhost:8787
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`.

`wrangler.jsonc` holds the real (public) Turnstile site key. For local dev, `.dev.vars.example` uses the always-pass test secret, which only works with the matching test site key `1x00000000000000000000AA`.

## Deploy (manual steps)

1. Make `wheresmcgraeballs.co.uk` a zone on Cloudflare.
2. Create a Turnstile widget for the domain. Put the site key in `vars.TURNSTILE_SITE_KEY`.
3. `npx wrangler d1 create graeballs-db`, then put the `database_id` in `wrangler.jsonc`.
4. Secrets: `npx wrangler secret put TURNSTILE_SECRET`, `ADMIN_TOKEN`, `IP_HASH_SALT`.
5. Custom domains are configured in the `routes` block of `wrangler.jsonc` (the zone must be on Cloudflare).
6. GitHub repo secrets `CLOUDFLARE_API_TOKEN` (Workers + D1 edit) and `CLOUDFLARE_ACCOUNT_ID`. Pushes to `main` then test, migrate and deploy via `.github/workflows/deploy.yml`.

If you use Cloudflare Workers Builds instead, set the build command to `npm run build` and the Worker name to match `name` in `wrangler.jsonc`.

## Hide a sighting

```bash
curl -X POST https://wheresmcgraeballs.co.uk/api/admin/hide/123 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# undo: .../api/admin/unhide/123
```

Hiding clears the cache straight away in the data centre that handled the request. Other data centres catch up within 10s (sightings) or 60s (heatmap, leaderboard).

## Free-plan checklist

- [ ] Billing page shows $0; no paid add-ons enabled.
- [ ] No R2, Durable Objects, Queues, Workers AI or the Rate Limiting binding. Rate limiting uses D1.

## Notes

- Basemap is standard OpenStreetMap tiles (CARTO now requires an API key). Change `TILE_URL` in `src/web/map.ts` and the CSP `img-src` in `src/web/static/_headers` and `src/worker/index.ts` to swap. Be kind to OSM's volunteer servers.
- IP addresses are stored only as salted SHA-256 hashes, for rate limiting.

## Observability

`wrangler.jsonc` enables Workers Logs (with invocation logs), Traces (10% sampling) and Issues, for both production and previews. From 1 Dec 2026 persisted logs/traces count toward Cloudflare Observability usage, so check the Free allowance and lower `head_sampling_rate` or set `persist: false` if you need to stay at $0.

## Project policies

- [LICENSE](LICENSE) (MIT)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): the site is a joke and harassment of anyone is not condoned
- [SECURITY.md](SECURITY.md): how to report a vulnerability privately
- [CLAUDE.md](CLAUDE.md): contributor notes, including the per-PR version bump
- [CHANGELOG.md](CHANGELOG.md)
