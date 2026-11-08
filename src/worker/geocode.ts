import { LIMITS } from "../shared/config";
import { clean } from "./validate";

// Reverse geocoding via OpenStreetMap Nominatim (https://operations.osmfoundation.org/policies/nominatim/).
// zoom=17 returns street-level results (road, no house number); zoom=18 would return buildings and POIs.
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
// Nominatim requires an identifying User-Agent.
const USER_AGENT =
  "wheresmcgraeballs.co.uk (joke site; https://github.com/ruku1143/wheresmcgraeballs-site)";
const TIMEOUT_MS = 2500;
const CACHE_TTL = 30 * 24 * 3600;

const ROAD_KEYS = ["road", "pedestrian", "footway", "cycleway", "path"];
const AREA_KEYS = ["suburb", "neighbourhood", "hamlet", "village", "town"];

function pick(address: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = address[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Build a deliberately non-specific place from a Nominatim address: the road name and the area,
 * e.g. "Telford Road, Houndmills". House numbers, buildings and named places are never used.
 */
export function placeFromAddress(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const a = address as Record<string, unknown>;
  const road = pick(a, ROAD_KEYS);
  let area = pick(a, AREA_KEYS);
  if (road && area && road.toLowerCase() === area.toLowerCase()) area = null;
  return clean([road, area].filter(Boolean).join(", "), LIMITS.place);
}

/** Look up the road and area for a point. Never throws: any failure returns null. */
export async function lookupPlace(lat: number, lng: number): Promise<string | null> {
  const cache = (caches as unknown as { default: Cache }).default;
  // About 10 m grid, so repeat spots reuse the answer without mixing up neighbouring roads.
  const key = new Request(`https://geocode.internal/${lat.toFixed(4)},${lng.toFixed(4)}`);

  // The cache is only an optimisation: a cache problem must never lose or block a lookup.
  try {
    const hit = await cache.match(key);
    if (hit) return ((await hit.json()) as { place: string | null }).place;
  } catch (e) {
    console.warn("geocode cache read failed", e);
  }

  let place: string | null;
  try {
    const url = `${NOMINATIM}?format=jsonv2&zoom=17&addressdetails=1&accept-language=en-GB&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("geocode lookup failed", res.status);
      return null;
    }
    place = placeFromAddress(((await res.json()) as { address?: unknown }).address);
  } catch (e) {
    console.warn("geocode lookup error", e);
    return null;
  }

  try {
    await cache.put(
      key,
      new Response(JSON.stringify({ place }), {
        headers: { "Cache-Control": `public, max-age=${CACHE_TTL}` },
      }),
    );
  } catch (e) {
    console.warn("geocode cache write failed", e);
  }
  return place;
}
