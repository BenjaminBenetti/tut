import { describe, expect, it } from "vitest";

import {
  escalationCap,
  escalationPerDay,
  infestationWeight,
  THREAT_TUNING,
} from "./threat-tuning";

describe("threat tuning", () => {
  it("uses finite non-negative values everywhere", () => {
    for (const value of [infestationWeight, escalationPerDay, escalationCap]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("lets a fully infested Earth reach maximum threat on its own", () => {
    expect(infestationWeight).toBeGreaterThanOrEqual(1);
  });

  it("keeps time alone from losing the game", () => {
    expect(escalationCap).toBeLessThan(100);
  });

  it("bundles the same values into THREAT_TUNING", () => {
    expect(THREAT_TUNING).toEqual({
      infestationWeight,
      escalationPerDay,
      escalationCap,
    });
  });
});
