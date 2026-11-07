export type StatusKey = "hot" | "warm" | "cool" | "cold" | "missing";

export interface Status {
  key: StatusKey;
  label: string;
  blurb: string;
}

const H = 3600;
const STATUSES: Record<StatusKey, Status> = {
  hot: { key: "hot", label: "🔥 Hot", blurb: "Active in the wild. Go outside." },
  warm: { key: "warm", label: "Warm", blurb: "Recently in the area." },
  cool: { key: "cool", label: "Cool", blurb: "Trail is going cold-ish." },
  cold: { key: "cold", label: "Cold", blurb: "Nobody has seen him for days." },
  missing: { key: "missing", label: "Missing", blurb: "Presumed on tour." },
};

/** Age is in seconds; null means no sightings at all. */
export function computeStatus(ageSeconds: number | null): Status {
  if (ageSeconds === null || ageSeconds >= 7 * 24 * H) return STATUSES.missing;
  if (ageSeconds < H) return STATUSES.hot;
  if (ageSeconds < 6 * H) return STATUSES.warm;
  if (ageSeconds < 24 * H) return STATUSES.cool;
  return STATUSES.cold;
}
