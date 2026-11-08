# Changelog

Versions follow [semver](https://semver.org). The current version lives in `package.json` and is shown bottom-right on the site. See `CLAUDE.md` for the bump rules.

## 0.3.1

- Add a CI workflow (`.github/workflows/ci.yml`): lint, typecheck, tests and build on every PR and push to `main`, plus a check that each PR bumps the version and adds a changelog entry.
- Remove the old "Test and deploy" workflow. Every run of it failed at startup, and deploys go through Cloudflare Workers Builds.

## 0.3.0

- Map pins are now coloured dots instead of the mic emoji. The colour follows the sighting's age (hot, warm, cool, cold, older), matching the banner. Sightings from the last 24 hours get a radar ping (respects reduced-motion).
- New Activity panel with Recent and Spotters tabs. Recent lists the latest sightings (anonymous spotters show as "(anonymous)"); tap one to jump to its pin.
- Add Cloudflare Web Analytics (cookie-less) to count visits. CSP updated and the privacy note mentions it.

## 0.2.1

- New sightings now show up live. Browsers no longer cache API reads, the server cache lasts 10s (was 30s) for sightings and 60s (was 5 min) for the heatmap and leaderboard, and posting or hiding a sighting clears the cache immediately for that data centre. The page polls every 20s (was 60s), using a single request.

## 0.2.0

- Lock the map to the Basingstoke area: can't pan or zoom out beyond it.
- New "When did you see him?" field (date and time, can't be in the future, up to 30 days back). Sightings are now ordered and aged by this time. Adds migration `0002_spotted_at.sql`.
- Empty-state banner now says "Presumed arrested."
- Show the site version bottom-right.
- Add `LICENSE` (MIT), `SECURITY.md` and `CODE_OF_CONDUCT.md` (the site is a joke; harassment of anyone is not condoned).
- Add `CLAUDE.md` with the version-bump rule.

## 0.1.0

- First release: Worker API (Hono + D1), Leaflet frontend, Turnstile, rate limiting, leaderboard, heatmap.
