# Changelog

Versions follow [semver](https://semver.org). The current version lives in `package.json` and is shown bottom-right on the site. See `CLAUDE.md` for the bump rules.

## 0.5.1

- Copy: drop the word "fictional". The footer now says "MC Graeballs is a character", and the README, code of conduct and docs say he is a character, not a real person to track.

## 0.5.0

Code review clean-up. Adds migration `0003_index_cleanup.sql`: apply it to `graeballs-db` and `graeballs-db-preview` when this ships.

- The leaderboard now counts nicknames case-insensitively, so "Tester", "tester" and "TESTER" are one spotter. Migration `0003` swaps the nickname index for a case-insensitive one and drops the unused `created_at` index, which saves a write on every insert.
- The swear-word filter matches at the start of a word, so place names like "Scunthorpe" are no longer blocked. "fucking" and "shitting" are still caught, and so are common compounds like "motherfucker" and "bullshit".
- Tests now use `@cloudflare/vitest-plugin`, the renamed `@cloudflare/vitest-pool-workers`. It uses the project's own wrangler, which clears the "unexpected field `issues`" and outdated-wrangler warnings.

- Fix: the edge cache for API reads is now keyed on each route's canonical URL, so junk query strings (`?x=1`, `?x=2`, ...) can no longer skip the cache and run up D1 reads. `/api/sightings`, `?limit=200` and `?limit=junk` now share one cache entry.
- Fix: closing the sighting form with Escape now removes the temporary pin (before, only Cancel did).
- Fix: admin hide/unhide reject ids like `12abc` instead of reading them as `12`.
- Validate a new sighting before calling Turnstile or D1, so bad input costs nothing. Turnstile verification now times out after 5s and handles the widget's error callback.
- API failures are now logged (they were swallowed), and an edge-cache failure no longer turns a read into an error.
- Tidy-ups: one shared `inBounds`, friendly error message and sightings limit for the Worker and the frontend; input max lengths come from the shared `LIMITS`; popup styles moved to CSS; a test now checks the CSP in `src/worker/index.ts` and `src/web/static/_headers` match.

## 0.4.1

- Add a 📅 calendar button next to "When did you see him?" on desktop, which opens the browser's date picker (phones keep their native picker). The browser's own controls now follow dark mode, which also makes the old tiny calendar icon visible in dark mode.

## 0.4.0

- The "Near:" place is now filled in automatically from where the pin was dropped, as the road name and area (for example "Telford Road, Houndmills"), never a house number or building. The free-text "Where, roughly?" field is gone. The lookup happens on the server using OpenStreetMap Nominatim, and a failed lookup just leaves the place blank. Older sightings keep the text they were given.

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
