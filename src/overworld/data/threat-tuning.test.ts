import { describe, expect, it } from "vitest";

import { THREAT_TUNING } from "./threat-tuning";

describe("threat tuning", () => {
  it("uses finite non-negative values everywhere", () => {
    const { infestationWeight, escalationPerDay, escalationCap } =
      THREAT_TUNING;
    for (const value of [infestationWeight, escalationPerDay, escalationCap]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("lets a fully infested Earth reach maximum threat on its own", () => {
    expect(THREAT_TUNING.infestationWeight).toBeGreaterThanOrEqual(1);
  });

  it("keeps time alone from losing the game", () => {
    expect(THREAT_TUNING.escalationCap).toBeLessThan(100);
  });

  // The "bundles the same values" case went with the scalars (#141):
  // one source of truth cannot disagree with itself.
});
