import { describe, expect, it } from "vitest";

import type { City } from "./city";
import {
  clampInfestation,
  MAX_INFESTATION,
  MIN_INFESTATION,
  withInfestation,
} from "./city";

const CITY: City = {
  id: "tokyo",
  name: "Tokyo",
  regionId: "east-asia",
  biome: "temperate",
  scale: "city",
  population: 37_000_000,
  layout: { x: 0.5, y: 0.5 },
  infestation: 40,
  detected: true,
  neighbourIds: [],
};

describe("clampInfestation", () => {
  it("passes in-range values through unchanged", () => {
    expect(clampInfestation(0)).toBe(MIN_INFESTATION);
    expect(clampInfestation(42)).toBe(42);
    expect(clampInfestation(100)).toBe(MAX_INFESTATION);
  });

  it("clamps values outside the bounds", () => {
    expect(clampInfestation(-7)).toBe(MIN_INFESTATION);
    expect(clampInfestation(250)).toBe(MAX_INFESTATION);
  });

  it("normalises negative zero to zero", () => {
    expect(Object.is(clampInfestation(-0), 0)).toBe(true);
  });
});

describe("withInfestation", () => {
  it("keeps a detected city detected while it stays infested", () => {
    expect(withInfestation(CITY, 55)).toEqual({ ...CITY, infestation: 55 });
  });

  it("forgets a city cleared to zero", () => {
    expect(withInfestation(CITY, 0)).toEqual({
      ...CITY,
      infestation: 0,
      detected: false,
    });
  });

  it("seeds a clean city undetected, whatever the stale flag said", () => {
    const clean: City = { ...CITY, infestation: 0, detected: true };
    expect(withInfestation(clean, 5)).toEqual({
      ...CITY,
      infestation: 5,
      detected: false,
    });
  });

  it("leaves an undetected city undetected as it grows", () => {
    const hidden: City = { ...CITY, detected: false };
    expect(withInfestation(hidden, 60).detected).toBe(false);
  });

  it("returns the same object when nothing changes", () => {
    expect(withInfestation(CITY, 40)).toBe(CITY);
    const clean: City = { ...CITY, infestation: 0, detected: false };
    expect(withInfestation(clean, 0)).toBe(clean);
  });

  it("never mutates its input", () => {
    const before = { ...CITY };
    withInfestation(CITY, 0);
    expect(CITY).toEqual(before);
  });
});
