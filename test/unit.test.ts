import { describe, expect, it } from "vitest";
import { spotterName } from "../src/shared/display";
import { placeFromAddress } from "../src/worker/geocode";
import { computeStatus, isRecent } from "../src/shared/status";
import { clean, containsBlocked, inBounds, validateSighting } from "../src/worker/validate";

const NOW = 1_800_000_000;

describe("status", () => {
  const H = 3600;
  it.each([
    [null, "missing"],
    [10, "hot"],
    [H - 1, "hot"],
    [H, "warm"],
    [6 * H - 1, "warm"],
    [6 * H, "cool"],
    [24 * H, "cold"],
    [7 * 24 * H - 1, "cold"],
    [7 * 24 * H, "missing"],
  ])("age %s -> %s", (age, key) => expect(computeStatus(age).key).toBe(key));
});

describe("bounds", () => {
  it("accepts the town centre", () => expect(inBounds(51.2665, -1.087)).toBe(true));
  it("rejects the sea and Australia", () => {
    expect(inBounds(50.0, -1.087)).toBe(false);
    expect(inBounds(-33.8, 151.2)).toBe(false);
  });
});

describe("sanitising", () => {
  it("strips control chars, collapses space and truncates", () => {
    expect(clean("  a\u0000b\n\nc  ", 10)).toBe("a b c");
    expect(clean("x".repeat(100), 24)).toHaveLength(24);
    expect(clean("   ", 10)).toBeNull();
    expect(clean(42, 10)).toBeNull();
  });
  it("validates a sighting and rejects bad input", () => {
    const ok = validateSighting({ lat: 51.27, lng: -1.09, activity: "vibing", note: "hi" }, NOW);
    expect(ok.ok).toBe(true);
    expect(validateSighting({ lat: 51.27, lng: -1.09, activity: "flying" }, NOW).ok).toBe(false);
    expect(validateSighting({ lat: 0, lng: 0, activity: "vibing" }, NOW).ok).toBe(false);
    expect(
      validateSighting({ lat: 51.27, lng: -1.09, activity: "vibing", note: "what the fuck" }, NOW)
        .ok,
    ).toBe(false);
  });
});

describe("spotted_at", () => {
  const base = { lat: 51.27, lng: -1.09, activity: "vibing" };
  const check = (spotted_at: unknown) => validateSighting({ ...base, spotted_at }, NOW);

  it("defaults to now when omitted", () => {
    const r = validateSighting(base, NOW);
    expect(r.ok && r.value.spotted_at).toBe(NOW);
  });
  it("accepts a past time", () => {
    const r = check(NOW - 3600);
    expect(r.ok && r.value.spotted_at).toBe(NOW - 3600);
  });
  it("clamps tiny clock skew to now, but rejects a real future time", () => {
    const skew = check(NOW + 60);
    expect(skew.ok && skew.value.spotted_at).toBe(NOW);
    expect(check(NOW + 3600).ok).toBe(false);
  });
  it("rejects too-old and malformed values", () => {
    expect(check(NOW - 31 * 24 * 3600).ok).toBe(false);
    expect(check("yesterday").ok).toBe(false);
    expect(check(1.5).ok).toBe(false);
  });
});

describe("recent pings and spotter names", () => {
  it("pings sightings under 24 hours old", () => {
    expect(isRecent(0)).toBe(true);
    expect(isRecent(24 * 3600 - 1)).toBe(true);
    expect(isRecent(24 * 3600)).toBe(false);
    expect(isRecent(3 * 24 * 3600)).toBe(false);
  });
  it("shows (anonymous) for unnamed spotters", () => {
    expect(spotterName(null)).toBe("(anonymous)");
    expect(spotterName(undefined)).toBe("(anonymous)");
    expect(spotterName("   ")).toBe("(anonymous)");
    expect(spotterName("Dazza")).toBe("Dazza");
  });
});

describe("placeFromAddress", () => {
  it("gives road and area", () => {
    expect(
      placeFromAddress({ road: "Telford Road", suburb: "Houndmills", town: "Basingstoke" }),
    ).toBe("Telford Road, Houndmills");
  });
  it("never includes house numbers, buildings or named places", () => {
    expect(
      placeFromAddress({
        house_number: "14",
        building: "Some House",
        amenity: "The Crown",
        road: "Winchester Road",
        suburb: "Kingsclere",
      }),
    ).toBe("Winchester Road, Kingsclere");
  });
  it("falls back sensibly", () => {
    expect(placeFromAddress({ road: "Church Lane", village: "Old Basing" })).toBe(
      "Church Lane, Old Basing",
    );
    expect(placeFromAddress({ road: "Church Lane" })).toBe("Church Lane");
    expect(placeFromAddress({ neighbourhood: "Popley" })).toBe("Popley");
    expect(placeFromAddress({ footway: "Riverside Path", town: "Basingstoke" })).toBe(
      "Riverside Path, Basingstoke",
    );
  });
  it("collapses a road named the same as its area, and handles nothing usable", () => {
    expect(placeFromAddress({ road: "Chineham", suburb: "chineham" })).toBe("Chineham");
    expect(placeFromAddress({})).toBeNull();
    expect(placeFromAddress(null)).toBeNull();
    expect(placeFromAddress({ county: "Hampshire", house_number: "3" })).toBeNull();
  });
  it("caps the length", () => {
    expect(placeFromAddress({ road: "x".repeat(200) })?.length).toBe(60);
  });
});

describe("blocked words", () => {
  it.each([
    "what the fuck",
    "FUCKING hell",
    "shitting it",
    "Kill Yourself",
    "you motherfucker",
    "bullshit",
  ])("blocks %s", (s) => expect(containsBlocked(s)).toBe(true));
  it.each([
    "Scunthorpe",
    "lost in Scunthorpe",
    "Penistone",
    "on the mic",
    "the mishit",
    "shiitake",
  ])("allows %s", (s) => expect(containsBlocked(s)).toBe(false));
});
