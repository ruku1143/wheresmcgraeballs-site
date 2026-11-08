import { computeStatus } from "../shared/status";
import { RATE, hashIp, isRateLimited } from "./ratelimit";
import { lookupPlace } from "./geocode";
import { validateSighting } from "./validate";
import { verifyTurnstile } from "./turnstile";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
  ADMIN_TOKEN: string;
  IP_HASH_SALT: string;
}

const PUBLIC_COLS = "id, lat, lng, place_name, activity, note, nickname, spotted_at";

export async function listSightings(db: D1Database, limit: number, now: number) {
  const { results } = await db
    .prepare(
      `SELECT ${PUBLIC_COLS} FROM sightings WHERE hidden = 0 ORDER BY spotted_at DESC LIMIT ?1`,
    )
    .bind(limit)
    .all();
  const latest = results[0] as { spotted_at: number } | undefined;
  return {
    sightings: results,
    status: computeStatus(latest ? now - latest.spotted_at : null),
    now,
  };
}

export async function latestSighting(db: D1Database, now: number) {
  const row = await db
    .prepare(
      `SELECT ${PUBLIC_COLS} FROM sightings WHERE hidden = 0 ORDER BY spotted_at DESC LIMIT 1`,
    )
    .first<{ spotted_at: number }>();
  return { sighting: row ?? null, status: computeStatus(row ? now - row.spotted_at : null), now };
}

export async function leaderboard(db: D1Database) {
  const { results } = await db
    .prepare(
      // "Tester" and "tester" are one spotter (ASCII case only, like SQLite's NOCASE).
      // MIN() picks a stable spelling to show. Uses idx_sightings_nickname_nocase.
      `SELECT MIN(nickname) AS nickname, COUNT(*) AS sightings FROM sightings
       WHERE hidden = 0 AND nickname IS NOT NULL
       GROUP BY nickname COLLATE NOCASE ORDER BY sightings DESC, nickname LIMIT 10`,
    )
    .all();
  return { leaderboard: results };
}

export async function heatmap(db: D1Database) {
  const { results } = await db
    .prepare(`SELECT lat, lng FROM sightings WHERE hidden = 0 ORDER BY spotted_at DESC LIMIT 1000`)
    .all<{ lat: number; lng: number }>();
  return { points: results.map((r) => [r.lat, r.lng]) };
}

export async function createSighting(
  env: Env,
  body: unknown,
  ip: string | null,
  now: number,
): Promise<
  | { status: 201; json: { sighting: unknown } }
  | { status: 400 | 403 | 429; json: { error: string } }
> {
  // Cheapest check first: bad input never costs a Turnstile call or a D1 read.
  const v = validateSighting(body, now);
  if (!v.ok) return { status: 400, json: { error: v.error } };
  const s = v.value;

  const token = (body as { turnstileToken?: unknown }).turnstileToken;
  if (!(await verifyTurnstile(token, env.TURNSTILE_SECRET, ip)))
    return { status: 403, json: { error: "Couldn't verify you're human. Refresh and try again." } };

  const ipHash = await hashIp(ip ?? "unknown", env.IP_HASH_SALT);
  if (await isRateLimited(env.DB, ipHash, now))
    return {
      status: 429,
      json: {
        error: `Easy, spotter. Max ${RATE.shortMax} sightings per 10 minutes. Let him breathe.`,
      },
    };

  // The place text always comes from the pin, never from the client.
  const place_name = await lookupPlace(s.lat, s.lng);

  const row = await env.DB.prepare(
    `INSERT INTO sightings (lat, lng, place_name, activity, note, nickname, created_at, spotted_at, ip_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) RETURNING ${PUBLIC_COLS}`,
  )
    .bind(s.lat, s.lng, place_name, s.activity, s.note, s.nickname, now, s.spotted_at, ipHash)
    .first();
  return { status: 201, json: { sighting: row } };
}
