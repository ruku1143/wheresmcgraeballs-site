import { computeStatus } from "../shared/status";
import { RATE, hashIp, isRateLimited } from "./ratelimit";
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

export const FRIENDLY_DB_ERROR = "Graeballs is resting, try again tomorrow.";

const PUBLIC_COLS = "id, lat, lng, place_name, activity, note, nickname, created_at";

export async function listSightings(db: D1Database, limit: number, now: number) {
  const { results } = await db
    .prepare(
      `SELECT ${PUBLIC_COLS} FROM sightings WHERE hidden = 0 ORDER BY created_at DESC LIMIT ?1`,
    )
    .bind(limit)
    .all();
  const latest = results[0] as { created_at: number } | undefined;
  return {
    sightings: results,
    status: computeStatus(latest ? now - latest.created_at : null),
    now,
  };
}

export async function latestSighting(db: D1Database, now: number) {
  const row = await db
    .prepare(
      `SELECT ${PUBLIC_COLS} FROM sightings WHERE hidden = 0 ORDER BY created_at DESC LIMIT 1`,
    )
    .first<{ created_at: number }>();
  return { sighting: row ?? null, status: computeStatus(row ? now - row.created_at : null), now };
}

export async function leaderboard(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT nickname, COUNT(*) AS sightings FROM sightings
       WHERE hidden = 0 AND nickname IS NOT NULL
       GROUP BY nickname ORDER BY sightings DESC LIMIT 10`,
    )
    .all();
  return { leaderboard: results };
}

export async function heatmap(db: D1Database) {
  const { results } = await db
    .prepare(`SELECT lat, lng FROM sightings WHERE hidden = 0 ORDER BY created_at DESC LIMIT 1000`)
    .all<{ lat: number; lng: number }>();
  return { points: results.map((r) => [r.lat, r.lng]) };
}

export async function createSighting(
  env: Env,
  body: unknown,
  ip: string | null,
  now: number,
): Promise<{ status: number; json: unknown }> {
  const token = (body as { turnstileToken?: unknown } | null)?.turnstileToken;
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

  const v = validateSighting(body);
  if (!v.ok) return { status: 400, json: { error: v.error } };
  const s = v.value;

  const row = await env.DB.prepare(
    `INSERT INTO sightings (lat, lng, place_name, activity, note, nickname, created_at, ip_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING ${PUBLIC_COLS}`,
  )
    .bind(s.lat, s.lng, s.place_name, s.activity, s.note, s.nickname, now, ipHash)
    .first();
  return { status: 201, json: { sighting: row } };
}
