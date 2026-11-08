# CLAUDE.md

Where's MC Graeballs? A joke "last seen" tracker for Basingstoke. One Cloudflare Worker (Hono API + static Leaflet frontend) with a D1 database, on the **Workers Free plan only**. See `PLAN.md` for the design and `README.md` for running and deploying.

## Every PR needs a version bump

The site version is the `version` field in `package.json` (semver). It is injected into the frontend at build time and shown bottom-right on the site. **Every pull request must bump it**, even for small fixes.

- **patch** (`0.2.0` to `0.2.1`): bug fixes, copy changes, config or docs-only tweaks that ship.
- **minor** (`0.2.0` to `0.3.0`): new user-visible features or API additions, including new migrations.
- **major** (`0.x` to `1.0.0` and beyond): breaking changes, or a deliberate "this is stable" release.

How to bump, in the same PR:

1. `npm version <patch|minor|major> --no-git-tag-version` (updates `package.json` and `package-lock.json`).
2. Add an entry for the new version at the top of `CHANGELOG.md`.
3. Don't bump a version that is already in `main`. If another PR merged first, bump again after merging `main` into your branch.

## Checks before pushing

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

The same checks run in GitHub Actions (`.github/workflows/ci.yml`), along with a "Version bumped" job that fails the PR if `package.json` still has the base branch's version or `CHANGELOG.md` has no entry for it.

## Things to know

- `public/` is generated (`npm run build`) and gitignored. Workers Builds also needs its dashboard **Build command** set to `npm run build`; `wrangler.jsonc` has a `build.command` as a backup.
- D1 migrations in `migrations/` are **not** applied by deploys. After merging a PR that adds one, apply it to both databases before (or right as) the new code goes live: `graeballs-db` (production) and `graeballs-db-preview` (previews).
- Never put secrets in the repo. `TURNSTILE_SECRET`, `ADMIN_TOKEN` and `IP_HASH_SALT` are Worker secrets.
- Don't use anything on the Cloudflare paid plan or the "Do NOT use" list in `PLAN.md` section 2b (R2, Durable Objects, Queues, the Rate Limiting binding, etc.). The one exception is **Cloudflare Web Analytics** (the beacon in `src/web/index.html`): it is free and cookie-less, and the CSP allows it. If you change the CSP, change it in both `src/worker/index.ts` and `src/web/static/_headers`.
- User text is rendered with `textContent` only. Never `innerHTML` with user data.
- No photos or likenesses of real people anywhere in the site.
- Play it straight: no "it's a joke" or "he's a character" disclaimers on the site. The house rules live in `CODE_OF_CONDUCT.md`.
