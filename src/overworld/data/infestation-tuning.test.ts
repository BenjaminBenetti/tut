import { describe, expect, it } from "vitest";

import { INFESTATION_TUNING } from "./infestation-tuning";

describe("infestation tuning", () => {
  it("uses finite values everywhere", () => {
    for (const value of Object.values(INFESTATION_TUNING)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("grows infested cities and never lets threat slow them", () => {
    expect(INFESTATION_TUNING.baseGrowthRate).toBeGreaterThan(0);
    expect(INFESTATION_TUNING.threatFactor).toBeGreaterThanOrEqual(0);
  });
});
