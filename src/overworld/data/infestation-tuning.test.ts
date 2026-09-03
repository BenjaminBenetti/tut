import { describe, expect, it } from "vitest";

import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
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

  it("spreads from a reachable threshold by a whole positive amount", () => {
    const { spreadThreshold, spreadAmount, spreadCooldownDays } =
      INFESTATION_TUNING;
    expect(Number.isInteger(spreadThreshold)).toBe(true);
    expect(spreadThreshold).toBeGreaterThan(MIN_INFESTATION);
    expect(spreadThreshold).toBeLessThanOrEqual(MAX_INFESTATION);
    expect(Number.isInteger(spreadAmount)).toBe(true);
    expect(spreadAmount).toBeGreaterThan(0);
    expect(Number.isInteger(spreadCooldownDays)).toBe(true);
    expect(spreadCooldownDays).toBeGreaterThan(0);
  });

  it("seeds rarely but with a real foothold", () => {
    expect(INFESTATION_TUNING.seedChance).toBeGreaterThan(0);
    expect(INFESTATION_TUNING.seedChance).toBeLessThanOrEqual(1);
    expect(Number.isInteger(INFESTATION_TUNING.seedAmount)).toBe(true);
    expect(INFESTATION_TUNING.seedAmount).toBeGreaterThan(0);
  });

  it("leaves the hive hook at no boost", () => {
    expect(INFESTATION_TUNING.hiveSpreadMultiplier).toBe(1);
  });
});
