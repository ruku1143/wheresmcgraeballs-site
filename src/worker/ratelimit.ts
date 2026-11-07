export const RATE = { shortWindow: 600, shortMax: 3, dayWindow: 86400, dayMax: 20 } as const;

export async function hashIp(ip: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isRateLimited(db: D1Database, ipHash: string, now: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT SUM(created_at > ?1) AS recent, COUNT(*) AS day
       FROM sightings WHERE ip_hash = ?2 AND created_at > ?3`,
    )
    .bind(now - RATE.shortWindow, ipHash, now - RATE.dayWindow)
    .first<{ recent: number | null; day: number }>();
  return (row?.recent ?? 0) >= RATE.shortMax || (row?.day ?? 0) >= RATE.dayMax;
}
