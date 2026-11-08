# Changelog

Versions follow [semver](https://semver.org). The current version lives in `package.json` and is shown bottom-right on the site. See `CLAUDE.md` for the bump rules.

## 0.2.0

- Lock the map to the Basingstoke area: can't pan or zoom out beyond it.
- New "When did you see him?" field (date and time, can't be in the future, up to 30 days back). Sightings are now ordered and aged by this time. Adds migration `0002_spotted_at.sql`.
- Empty-state banner now says "Presumed arrested."
- Show the site version bottom-right.
- Add `LICENSE` (MIT), `SECURITY.md` and `CODE_OF_CONDUCT.md` (the site is a joke; harassment of anyone is not condoned).
- Add `CLAUDE.md` with the version-bump rule.

## 0.1.0

- First release: Worker API (Hono + D1), Leaflet frontend, Turnstile, rate limiting, leaderboard, heatmap.
