import { describe, expect, it } from "vitest";
import { computeStatus } from "../src/shared/status";
import { clean, inBounds, validateSighting } from "../src/worker/validate";

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
    const ok = validateSighting({ lat: 51.27, lng: -1.09, activity: "vibing", note: "hi" });
    expect(ok.ok).toBe(true);
    expect(validateSighting({ lat: 51.27, lng: -1.09, activity: "flying" }).ok).toBe(false);
    expect(validateSighting({ lat: 0, lng: 0, activity: "vibing" }).ok).toBe(false);
    expect(
      validateSighting({ lat: 51.27, lng: -1.09, activity: "vibing", note: "what the fuck" }).ok,
    ).toBe(false);
  });
});
