import type { Status } from "../shared/status";

export interface Sighting {
  id: number;
  lat: number;
  lng: number;
  place_name: string | null;
  activity: string;
  note: string | null;
  nickname: string | null;
  created_at: number;
}
export interface NewSighting {
  lat: number;
  lng: number;
  activity: string;
  place_name?: string;
  note?: string;
  nickname?: string;
  turnstileToken: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Graeballs is resting, try again tomorrow.");
  return data;
}

export const getSightings = () =>
  get<{ sightings: Sighting[]; status: Status; now: number }>("/api/sightings?limit=200");
export const getLatest = () =>
  get<{ sighting: Sighting | null; status: Status; now: number }>("/api/latest");
export const getLeaderboard = () =>
  get<{ leaderboard: { nickname: string; sightings: number }[] }>("/api/leaderboard");
export const getHeatmap = () => get<{ points: [number, number][] }>("/api/heatmap");
export const getConfig = () => get<{ turnstileSiteKey: string }>("/api/config");

export async function postSighting(body: NewSighting): Promise<void> {
  const res = await fetch("/api/sightings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
}
