// Shared by the Worker and the frontend.
export const BOUNDS = { south: 51.22, north: 51.31, west: -1.17, east: -1.0 } as const;
export const CENTRE: [number, number] = [51.2665, -1.087];
export const DEFAULT_ZOOM = 14;

export const ACTIVITIES = [
  "vibing",
  "on the mic",
  "in the Malls",
  "waiting for a bus",
  "lost",
  "at the pub",
  "bare mysterious",
  "other",
] as const;
export type Activity = (typeof ACTIVITIES)[number];

/** How far back a sighting can be dated, and clock-skew tolerance for "not in the future". */
export const SPOTTED = { maxAgeSeconds: 30 * 24 * 3600, skewSeconds: 120 } as const;

export const LIMITS = { place: 60, note: 140, nickname: 24 } as const;
