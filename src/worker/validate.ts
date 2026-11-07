import { ACTIVITIES, BOUNDS, LIMITS, type Activity } from "../shared/config";

export interface SightingInput {
  lat: number;
  lng: number;
  place_name: string | null;
  activity: Activity;
  note: string | null;
  nickname: string | null;
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
  const place_name = clean(b.place_name, LIMITS.place);
  const note = clean(b.note, LIMITS.note);
  const nickname = clean(b.nickname, LIMITS.nickname);
  if (containsBlocked(place_name) || containsBlocked(note) || containsBlocked(nickname))
    return { ok: false, error: "Keep it clean, please." };
  return {
    ok: true,
    value: { lat, lng, place_name, activity: b.activity as Activity, note, nickname },
  };
}
