import { Hono, type Context } from "hono";
import { SIGHTINGS_LIMIT } from "../shared/config";
import { FRIENDLY_DB_ERROR } from "../shared/display";
import {
  createSighting,
  heatmap,
  latestSighting,
  leaderboard,
  listSightings,
  type Env,
} from "./sightings";

type Ctx = Context<{ Bindings: Env }>;
const app = new Hono<{ Bindings: Env }>();

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://tile.openstreetmap.org",
  "connect-src 'self' https://cloudflareinsights.com",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function applySecurityHeaders(res: Response): Response {
  const r = new Response(res.body, res);
  r.headers.set("Content-Security-Policy", CSP);
  r.headers.set("X-Content-Type-Options", "nosniff");
  r.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  r.headers.set("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  return r;
}

app.use("*", async (c, next) => {
  await next();
  c.res = applySecurityHeaders(c.res);
});

const nowSec = () => Math.floor(Date.now() / 1000);

/** Edge cache lifetimes in seconds. Short, so new sightings feel live. */
const TTL = { sightings: 10, rollups: 60 } as const;

const edgeCache = () => caches.default;

/**
 * Edge-cache key for a read. It is built from the route's canonical path, never the raw URL, so
 * junk query strings (`?x=1`, `?x=2`, ...) can't bypass the cache and burn the D1 read quota.
 */
const cacheKey = (c: Ctx, path: string) => new Request(new URL(path, c.req.url).toString());

/** Canonical paths of every cached read; a write purges all of them. */
const READ_PATHS = {
  sightings: (limit: number) => `/api/sightings?limit=${limit}`,
  latest: "/api/latest",
  heatmap: "/api/heatmap",
  leaderboard: "/api/leaderboard",
} as const;

/** Browsers must always ask us again; only our own short-lived edge cache protects D1. */
function forBrowser(res: Response): Response {
  const r = new Response(res.body, res);
  r.headers.set("Cache-Control", "no-cache");
  return r;
}

/** Run a D1-backed read through a short edge cache, with a friendly failure message. */
async function cached(c: Ctx, path: string, ttl: number, produce: () => Promise<unknown>) {
  const cache = edgeCache();
  const key = cacheKey(c, path);
  try {
    const hit = await cache.match(key);
    if (hit) return forBrowser(hit);
  } catch (e) {
    console.warn("edge cache read failed", e); // the cache is only an optimisation
  }
  try {
    const body = JSON.stringify(await produce());
    const stored = new Response(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
    });
    c.executionCtx.waitUntil(cache.put(key, stored).catch(() => {}));
    return forBrowser(new Response(body, { headers: { "Content-Type": "application/json" } }));
  } catch (e) {
    console.error("read failed", path, e);
    return c.json({ error: FRIENDLY_DB_ERROR }, 503);
  }
}

/** Drop this data centre's cached reads so a write shows up straight away. Other data centres expire within the TTL. */
async function purgeReads(c: Ctx) {
  const paths = [
    READ_PATHS.sightings(SIGHTINGS_LIMIT),
    READ_PATHS.latest,
    READ_PATHS.heatmap,
    READ_PATHS.leaderboard,
  ];
  try {
    await Promise.all(paths.map((p) => edgeCache().delete(cacheKey(c, p))));
  } catch (e) {
    console.warn("edge cache purge failed", e); // best effort
  }
}

app.get("/api/sightings", (c) => {
  const asked = parseInt(c.req.query("limit") ?? "", 10) || SIGHTINGS_LIMIT;
  const limit = Math.min(Math.max(asked, 1), 500);
  return cached(c, READ_PATHS.sightings(limit), TTL.sightings, () =>
    listSightings(c.env.DB, limit, nowSec()),
  );
});

app.get("/api/config", (c) => c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY }));
app.get("/api/latest", (c) =>
  cached(c, READ_PATHS.latest, TTL.sightings, () => latestSighting(c.env.DB, nowSec())),
);
app.get("/api/leaderboard", (c) =>
  cached(c, READ_PATHS.leaderboard, TTL.rollups, () => leaderboard(c.env.DB)),
);
app.get("/api/heatmap", (c) => cached(c, READ_PATHS.heatmap, TTL.rollups, () => heatmap(c.env.DB)));

app.post("/api/sightings", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request." }, 400);
  }
  try {
    const r = await createSighting(c.env, body, c.req.header("CF-Connecting-IP") ?? null, nowSec());
    if (r.status === 201) await purgeReads(c);
    return c.json(r.json, r.status);
  } catch (e) {
    console.error("create sighting failed", e);
    return c.json({ error: FRIENDLY_DB_ERROR }, 503);
  }
});

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function setHidden(c: Ctx, hidden: 0 | 1) {
  const auth = c.req.header("Authorization") ?? "";
  if (!c.env.ADMIN_TOKEN || !safeEqual(auth, `Bearer ${c.env.ADMIN_TOKEN}`))
    return c.json({ error: "Unauthorized" }, 401);
  const raw = c.req.param("id") ?? "";
  const id = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id)) return c.json({ error: "Bad id" }, 400);
  try {
    const r = await c.env.DB.prepare("UPDATE sightings SET hidden = ?1 WHERE id = ?2")
      .bind(hidden, id)
      .run();
    await purgeReads(c);
    return c.json({ ok: true, changed: r.meta.changes });
  } catch (e) {
    console.error("set hidden failed", e);
    return c.json({ error: FRIENDLY_DB_ERROR }, 503);
  }
}

app.post("/api/admin/hide/:id", (c) => setHidden(c, 1));
app.post("/api/admin/unhide/:id", (c) => setHidden(c, 0));

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
