import { env } from "cloudflare:workers";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/worker/index";

// Await anything the Worker hands to waitUntil (cache writes) so tests are deterministic.
const call = async (path: string, init?: RequestInit) => {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    passThroughOnException() {},
  } as unknown as ExecutionContext;
  const res = await app.fetch(new Request(`https://example.com${path}`, init), env as never, ctx);
  await Promise.all(pending);
  return res;
};

const post = (body: object, ip = "1.1.1.1") =>
  call("/api/sightings", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({
      lat: 51.2665,
      lng: -1.087,
      activity: "vibing",
      turnstileToken: "ok",
      ...body,
    }),
  });

function mockTurnstile(success: boolean) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify({ success }), {
        headers: { "content-type": "application/json" },
      }),
  );
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM sightings").run();
  mockTurnstile(true);
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/sightings", () => {
  it("creates a sighting", async () => {
    const res = await post({ nickname: "Tester", note: "hello" });
    expect(res.status).toBe(201);
    const { sighting } = (await res.json()) as { sighting: Record<string, unknown> };
    expect(sighting.nickname).toBe("Tester");
    expect(sighting).not.toHaveProperty("ip_hash");
  });

  it("rejects a failed Turnstile check", async () => {
    mockTurnstile(false);
    expect((await post({})).status).toBe(403);
  });

  it("rejects out-of-bounds pins", async () => {
    expect((await post({ lat: -33.8, lng: 151.2 })).status).toBe(400);
  });

  it("rate limits the 4th sighting in 10 minutes", async () => {
    for (let i = 0; i < 3; i++) expect((await post({})).status).toBe(201);
    const res = await post({});
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/Easy, spotter/);
    expect((await post({}, "2.2.2.2")).status).toBe(201);
  });
});

describe("spotted_at", () => {
  const now = () => Math.floor(Date.now() / 1000);

  it("stores a past spotted time and orders by it", async () => {
    expect((await post({ spotted_at: now() - 7200, note: "older" })).status).toBe(201);
    expect((await post({ spotted_at: now() - 60, note: "newer" })).status).toBe(201);
    expect((await post({ spotted_at: now() - 86400, note: "oldest" })).status).toBe(201);
    const list = (await (await call("/api/sightings?x=order")).json()) as {
      sightings: { note: string }[];
    };
    expect(list.sightings.map((s) => s.note)).toEqual(["newer", "older", "oldest"]);
    const latest = (await (await call("/api/latest?x=order")).json()) as {
      sighting: { note: string };
      status: { key: string };
    };
    expect(latest.sighting.note).toBe("newer");
    expect(latest.status.key).toBe("hot");
  });

  it("rejects a future spotted time", async () => {
    const res = await post({ spotted_at: now() + 3600 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/future/);
  });

  it("an old sighting does not make the banner hot", async () => {
    await post({ spotted_at: now() - 3 * 86400 });
    const latest = (await (await call("/api/latest?x=old")).json()) as { status: { key: string } };
    expect(latest.status.key).toBe("cold");
  });
});

describe("live updates", () => {
  const URL_ = "/api/sightings?limit=200";
  const notes = async () =>
    ((await (await call(URL_)).json()) as { sightings: { note: string }[] }).sightings.map(
      (s) => s.note,
    );

  it("tells browsers never to cache reads", async () => {
    for (const path of [
      "/api/sightings?limit=200",
      "/api/latest",
      "/api/heatmap",
      "/api/leaderboard",
    ]) {
      const first = await call(path);
      expect(first.headers.get("Cache-Control"), path).toBe("no-cache");
      const second = await call(path); // served from the edge cache
      expect(second.headers.get("Cache-Control"), path).toBe("no-cache");
    }
  });

  it("shows a new sighting on the very next read of the same URL", async () => {
    expect(await notes()).toEqual([]); // primes the edge cache with an empty list
    expect((await post({ note: "fresh" })).status).toBe(201);
    expect(await notes()).toEqual(["fresh"]);
  });

  it("drops a hidden sighting on the very next read", async () => {
    const created = (await (await post({ note: "gone soon" })).json()) as {
      sighting: { id: number };
    };
    expect(await notes()).toEqual(["gone soon"]);
    await call(`/api/admin/hide/${created.sighting.id}`, {
      method: "POST",
      headers: { Authorization: "Bearer test-admin" },
    });
    expect(await notes()).toEqual([]);
  });
});

describe("reads and admin", () => {
  it("hides and unhides sightings everywhere", async () => {
    const created = (await (await post({ nickname: "Ghost" })).json()) as {
      sighting: { id: number };
    };
    const id = created.sighting.id;
    const auth = { Authorization: "Bearer test-admin" };

    expect((await call(`/api/admin/hide/${id}`, { method: "POST" })).status).toBe(401);
    expect((await call(`/api/admin/hide/${id}`, { method: "POST", headers: auth })).status).toBe(
      200,
    );

    const list = (await (await call("/api/sightings?x=hidden")).json()) as { sightings: unknown[] };
    expect(list.sightings).toHaveLength(0);
    const lb = (await (await call("/api/leaderboard?x=hidden")).json()) as {
      leaderboard: unknown[];
    };
    expect(lb.leaderboard).toHaveLength(0);
    const heat = (await (await call("/api/heatmap?x=hidden")).json()) as { points: unknown[] };
    expect(heat.points).toHaveLength(0);
    const latest = (await (await call("/api/latest?x=hidden")).json()) as {
      sighting: unknown;
      status: { key: string };
    };
    expect(latest.sighting).toBeNull();
    expect(latest.status.key).toBe("missing");

    await call(`/api/admin/unhide/${id}`, { method: "POST", headers: auth });
    const again = (await (await call("/api/sightings?x=unhidden")).json()) as {
      sightings: unknown[];
    };
    expect(again.sightings).toHaveLength(1);
  });

  it("returns security headers", async () => {
    const res = await call("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Security-Policy")).toContain("challenges.cloudflare.com");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
