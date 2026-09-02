import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../data/earth-map";
import { THREAT_TUNING } from "../data/threat-tuning";
import type { EarthMap } from "../model/earth-map";
import { MAX_THREAT, MIN_THREAT } from "../model/threat";
import type { ThreatTuning } from "../model/threat-tuning";
import { buildEarthMap } from "./earth-map-builder";
import {
  computeThreat,
  escalation,
  globalInfestation,
  regionInfestation,
  unfestedFraction,
} from "./threat-service";

// ===========================================
// Fixtures
// ===========================================

/** Returns a copy of `map` with every city at the given infestation. */
function withInfestation(map: EarthMap, infestation: number): EarthMap {
  return {
    regions: map.regions,
    cities: map.cities.map((city) => ({ ...city, infestation })),
  };
}

/**
 * Two regions with known infestation:
 *
 *   west: a=20  b=40  c=90   (mean 50)
 *   east: d=10               (mean 10)
 *   global mean = 40
 */
const MIXED = buildEarthMap({
  regions: [
    {
      id: "west",
      name: "West",
      biome: "temperate",
      cities: [
        { id: "a", name: "A", layout: { x: 0.1, y: 0.1 }, infestation: 20 },
        { id: "b", name: "B", layout: { x: 0.2, y: 0.1 }, infestation: 40 },
        { id: "c", name: "C", layout: { x: 0.3, y: 0.1 }, infestation: 90 },
      ],
    },
    {
      id: "east",
      name: "East",
      biome: "desert",
      cities: [
        { id: "d", name: "D", layout: { x: 0.8, y: 0.8 }, infestation: 10 },
      ],
    },
  ],
  links: [
    ["a", "b"],
    ["b", "c"],
    ["c", "d"],
  ],
});

const NO_ESCALATION: ThreatTuning = {
  infestationWeight: 1,
  escalationPerDay: 0,
  escalationCap: 0,
};

// ===========================================
// Aggregates
// ===========================================

describe("regionInfestation", () => {
  it("returns the mean of the region's cities", () => {
    expect(regionInfestation(MIXED, "west")).toBe(50);
    expect(regionInfestation(MIXED, "east")).toBe(10);
  });

  it("is zero on the shipped clean Earth", () => {
    for (const region of EARTH_MAP.regions) {
      expect(regionInfestation(EARTH_MAP, region.id), region.id).toBe(0);
    }
  });

  it("throws on an unknown region", () => {
    expect(() => regionInfestation(MIXED, "nowhere")).toThrow(/Unknown region/);
  });
});

describe("globalInfestation and unfestedFraction", () => {
  it("average over every city, not over regions", () => {
    expect(globalInfestation(MIXED)).toBe(40);
    expect(unfestedFraction(MIXED)).toBeCloseTo(0.6);
  });

  it("span the full range from clean to overrun", () => {
    expect(unfestedFraction(EARTH_MAP)).toBe(1);
    expect(unfestedFraction(withInfestation(EARTH_MAP, 100))).toBe(0);
    expect(unfestedFraction(withInfestation(EARTH_MAP, 50))).toBeCloseTo(0.5);
  });
});

// ===========================================
// Escalation
// ===========================================

describe("escalation", () => {
  it("is zero on day zero and grows linearly until the cap", () => {
    expect(escalation(0, THREAT_TUNING)).toBe(0);
    expect(escalation(10, THREAT_TUNING)).toBeCloseTo(
      THREAT_TUNING.escalationPerDay * 10,
    );
    expect(escalation(1_000_000, THREAT_TUNING)).toBe(
      THREAT_TUNING.escalationCap,
    );
  });

  it("never decreases as days pass", () => {
    let previous = escalation(0, THREAT_TUNING);
    for (let day = 1; day <= 500; day++) {
      const current = escalation(day, THREAT_TUNING);
      expect(current, `day ${day}`).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it("rejects negative or non-finite days", () => {
    expect(() => escalation(-1, THREAT_TUNING)).toThrow(RangeError);
    expect(() => escalation(Number.NaN, THREAT_TUNING)).toThrow(RangeError);
    expect(() => escalation(Number.POSITIVE_INFINITY, THREAT_TUNING)).toThrow(
      RangeError,
    );
  });
});

// ===========================================
// Threat
// ===========================================

describe("computeThreat", () => {
  it("equals the escalation alone on a clean Earth", () => {
    for (const day of [0, 1, 42, 300, 5000]) {
      expect(computeThreat(EARTH_MAP, day, THREAT_TUNING), `day ${day}`).toBe(
        escalation(day, THREAT_TUNING),
      );
    }
  });

  it("is the maximum on a fully infested Earth, on any day", () => {
    const overrun = withInfestation(EARTH_MAP, 100);
    expect(computeThreat(overrun, 0, THREAT_TUNING)).toBe(MAX_THREAT);
    expect(computeThreat(overrun, 999, THREAT_TUNING)).toBe(MAX_THREAT);
    expect(computeThreat(overrun, 0, NO_ESCALATION)).toBe(MAX_THREAT);
  });

  it("adds weighted mean infestation to the escalation", () => {
    expect(computeThreat(MIXED, 0, NO_ESCALATION)).toBe(40);
    expect(computeThreat(MIXED, 100, THREAT_TUNING)).toBeCloseTo(
      40 * THREAT_TUNING.infestationWeight + escalation(100, THREAT_TUNING),
    );
    expect(
      computeThreat(MIXED, 0, { ...NO_ESCALATION, infestationWeight: 0.5 }),
    ).toBe(20);
  });

  it("clamps into [MIN_THREAT, MAX_THREAT]", () => {
    expect(
      computeThreat(MIXED, 0, { ...NO_ESCALATION, infestationWeight: 5 }),
    ).toBe(MAX_THREAT);
    expect(
      computeThreat(MIXED, 0, { ...NO_ESCALATION, infestationWeight: -1 }),
    ).toBe(MIN_THREAT);
  });

  it("rejects negative or non-finite days", () => {
    expect(() => computeThreat(MIXED, -1, THREAT_TUNING)).toThrow(RangeError);
  });
});
