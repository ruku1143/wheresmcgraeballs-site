import { ACTIVITIES, BOUNDS, LIMITS, SPOTTED, type Activity } from "../shared/config";

export interface SightingInput {
  lat: number;
  lng: number;
  activity: Activity;
  note: string | null;
  nickname: string | null;
  spotted_at: number;
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const BLOCKED = ["fuck", "shit", "cunt", "nigger", "paedo", "kill yourself"];

export function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return s.length ? s : null;
}

export function containsBlocked(s: string | null): boolean {
  if (!s) return false;
  const l = s.toLowerCase();
  return BLOCKED.some((w) => l.includes(w));
}

export function inBounds(lat: number, lng: number): boolean {
  return lat >= BOUNDS.south && lat <= BOUNDS.north && lng >= BOUNDS.west && lng <= BOUNDS.east;
}

export function validateSighting(
  body: unknown,
  now: number,
): { ok: true; value: SightingInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request." };
  const b = body as Record<string, unknown>;
  const { lat, lng } = b;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  )
    return { ok: false, error: "Pick a spot on the map." };
  if (!inBounds(lat, lng))
    return { ok: false, error: "That's outside Basingstoke. He's not there." };
  if (typeof b.activity !== "string" || !(ACTIVITIES as readonly string[]).includes(b.activity))
    return { ok: false, error: "Pick what he was up to." };
  let spotted_at = now;
  if (b.spotted_at !== undefined && b.spotted_at !== null) {
    const t = b.spotted_at;
    if (typeof t !== "number" || !Number.isInteger(t))
      return { ok: false, error: "That date doesn't look right." };
    if (t > now + SPOTTED.skewSeconds)
      return { ok: false, error: "He can't have been spotted in the future." };
    if (t < now - SPOTTED.maxAgeSeconds)
      return { ok: false, error: "That's too long ago. The trail is cold." };
    spotted_at = Math.min(t, now);
  }
  const note = clean(b.note, LIMITS.note);
  const nickname = clean(b.nickname, LIMITS.nickname);
  if (containsBlocked(note) || containsBlocked(nickname))
    return { ok: false, error: "Keep it clean, please." };
  return {
    ok: true,
    value: {
      lat,
      lng,
      activity: b.activity as Activity,
      note,
      nickname,
      spotted_at,
    },
  };
}
