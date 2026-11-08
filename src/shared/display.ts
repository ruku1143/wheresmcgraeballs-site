export const ANONYMOUS = "(anonymous)";

/** Spotter name for display; sightings without a nickname are anonymous. */
export function spotterName(nickname: string | null | undefined): string {
  const n = nickname?.trim();
  return n ? n : ANONYMOUS;
}
