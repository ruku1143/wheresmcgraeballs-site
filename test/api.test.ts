import { env } from "cloudflare:workers";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/worker/index";
import headersFile from "../src/web/static/_headers?raw";

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Place = Record<string, string> | "fail";
let nominatimCalls: { url: string; userAgent: string | null }[] = [];

/** Route outgoing fetches: Turnstile verification and the Nominatim reverse geocoder. */
function mockFetch(opts: { turnstile?: boolean; place?: Place } = {}) {
  const { turnstile = true, place = { road: "Telford Road", suburb: "Houndmills" } } = opts;
  nominatimCalls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("nominatim.openstreetmap.org")) {
      const headers = new Headers(init?.headers);
      nominatimCalls.push({ url, userAgent: headers.get("User-Agent") });
      return place === "fail" ? json({ error: "boom" }, 500) : json({ address: place });
    }
    return json({ success: turnstile });
  });
}

const CACHED_READS = [
  "/api/sightings?limit=200",
  "/api/latest",
  "/api/heatmap",
  "/api/leaderboard",
];

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM sightings").run();
  // Start every test with an empty edge cache, so no test sees another's cached reads.
  await Promise.all(
    CACHED_READS.map((p) => caches.default.delete(new Request(`https://example.com${p}`))),
  );
  mockFetch();
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
    mockFetch({ turnstile: false });
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
    const list = (await (await call("/api/sightings")).json()) as {
      sightings: { note: string }[];
    };
    expect(list.sightings.map((s) => s.note)).toEqual(["newer", "older", "oldest"]);
    const latest = (await (await call("/api/latest")).json()) as {
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
    const latest = (await (await call("/api/latest")).json()) as { status: { key: string } };
    expect(latest.status.key).toBe("cold");
  });
});

describe("place from the pin", () => {
  const placeOf = async (res: Response) =>
    ((await res.json()) as { sighting: { place_name: string | null } }).sighting.place_name;

  it("stores road and area from the pin, with no house number", async () => {
    mockFetch({
      place: {
        house_number: "12",
        road: "Telford Road",
        suburb: "Houndmills",
        town: "Basingstoke",
      },
    });
    const res = await post({ lat: 51.273, lng: -1.11 });
    expect(res.status).toBe(201);
    expect(await placeOf(res)).toBe("Telford Road, Houndmills");
    expect(nominatimCalls).toHaveLength(1);
    expect(nominatimCalls[0].url).toContain("zoom=17");
    expect(nominatimCalls[0].userAgent).toMatch(/wheresmcgraeballs/);
  });

  it("ignores a place_name sent by the client", async () => {
    mockFetch({ place: { road: "Church Lane", village: "Old Basing" } });
    const res = await post({ lat: 51.2801, lng: -1.0402, place_name: "14 Acacia Avenue" });
    expect(await placeOf(res)).toBe("Church Lane, Old Basing");
  });

  it("still saves the sighting when the geocoder fails", async () => {
    mockFetch({ place: "fail" });
    const res = await post({ lat: 51.2555, lng: -1.0701 });
    expect(res.status).toBe(201);
    expect(await placeOf(res)).toBeNull();
  });

  it("reuses the answer for the same spot instead of asking again", async () => {
    mockFetch({ place: { road: "Southview Road", suburb: "Hatch Warren" } });
    await post({ lat: 51.2602, lng: -1.1203 });
    expect(nominatimCalls).toHaveLength(1);
    const second = await post({ lat: 51.2602, lng: -1.1203 }, "2.2.2.2");
    expect(await placeOf(second)).toBe("Southview Road, Hatch Warren");
    expect(nominatimCalls).toHaveLength(1);
  });

  it("does not look anything up for a request that is rejected", async () => {
    mockFetch();
    const res = await post({ lat: -33.8, lng: 151.2 });
    expect(res.status).toBe(400);
    expect(nominatimCalls).toHaveLength(0);
  });
});

describe("edge cache", () => {
  it("can't be bypassed with junk query strings", async () => {
    await call("/api/latest");
    await post({ note: "after" }); // purges the canonical entry, so prime it again
    const first = (await (await call("/api/latest")).json()) as { sighting: { note: string } };
    expect(first.sighting.note).toBe("after");
    // A write that skips the purge (straight to D1) must not be visible through a junk query.
    await env.DB.prepare("UPDATE sightings SET note = 'sneaky'").run();
    for (const q of ["?x=1", "?cachebust=2", ""]) {
      const r = (await (await call(`/api/latest${q}`)).json()) as { sighting: { note: string } };
      expect(r.sighting.note, q).toBe("after");
    }
  });

  it("shares one entry for every spelling of the default sightings list", async () => {
    await call("/api/sightings");
    await env.DB.prepare(
      "INSERT INTO sightings (lat, lng, activity, created_at, spotted_at, ip_hash) VALUES (51.27, -1.09, 'lost', 1, 1, 'x')",
    ).run();
    for (const q of ["", "?limit=200", "?limit=junk", "?limit=200&x=1"]) {
      const r = (await (await call(`/api/sightings${q}`)).json()) as { sightings: unknown[] };
      expect(r.sightings, q).toHaveLength(0);
    }
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

    const list = (await (await call("/api/sightings")).json()) as { sightings: unknown[] };
    expect(list.sightings).toHaveLength(0);
    const lb = (await (await call("/api/leaderboard")).json()) as {
      leaderboard: unknown[];
    };
    expect(lb.leaderboard).toHaveLength(0);
    const heat = (await (await call("/api/heatmap")).json()) as { points: unknown[] };
    expect(heat.points).toHaveLength(0);
    const latest = (await (await call("/api/latest")).json()) as {
      sighting: unknown;
      status: { key: string };
    };
    expect(latest.sighting).toBeNull();
    expect(latest.status.key).toBe("missing");

    await call(`/api/admin/unhide/${id}`, { method: "POST", headers: auth });
    const again = (await (await call("/api/sightings")).json()) as {
      sightings: unknown[];
    };
    expect(again.sightings).toHaveLength(1);
  });

  it("rejects a malformed admin id", async () => {
    const auth = { Authorization: "Bearer test-admin" };
    for (const id of ["12abc", "1e3", "-1"])
      expect(
        (await call(`/api/admin/hide/${id}`, { method: "POST", headers: auth })).status,
        id,
      ).toBe(400);
  });

  it("returns security headers", async () => {
    const res = await call("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Security-Policy")).toContain("challenges.cloudflare.com");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("CSP", () => {
  it("is identical in the Worker and in static/_headers", async () => {
    const worker = (await call("/api/nope")).headers.get("Content-Security-Policy");
    const fromFile = headersFile.match(/Content-Security-Policy:\s*(.+)/)?.[1].trim();
    expect(fromFile).toBe(worker);
  });
});
