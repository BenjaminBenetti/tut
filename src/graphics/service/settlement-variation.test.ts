import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import { SETTLEMENT_VARIATION_TUNING } from "../data/settlement-variation-tuning";
import { settlementVariation } from "./settlement-variation";

describe("settlementVariation (#1155)", () => {
  it("is deterministic per city id", () => {
    expect(settlementVariation("tokyo")).toEqual(settlementVariation("tokyo"));
  });

  it("stays within tuning for every city on the map", () => {
    const { maxYaw, minHeightScale, maxHeightScale } =
      SETTLEMENT_VARIATION_TUNING;
    for (const city of EARTH_MAP.cities) {
      const v = settlementVariation(city.id);
      expect(Math.abs(v.yaw)).toBeLessThanOrEqual(maxYaw);
      expect(v.heightScale).toBeGreaterThanOrEqual(minHeightScale);
      expect(v.heightScale).toBeLessThanOrEqual(maxHeightScale);
    }
  });

  it("gives no two cities of the map the same variation, and mirrors some but not all", () => {
    const seen = new Set<string>();
    let mirrored = 0;
    for (const city of EARTH_MAP.cities) {
      const v = settlementVariation(city.id);
      seen.add(
        `${String(v.mirrored)}:${v.yaw.toFixed(5)}:${v.heightScale.toFixed(5)}`,
      );
      if (v.mirrored) mirrored += 1;
    }
    expect(seen.size).toBe(EARTH_MAP.cities.length);
    expect(mirrored).toBeGreaterThan(0);
    expect(mirrored).toBeLessThan(EARTH_MAP.cities.length);
  });

  it("honours a custom tuning", () => {
    const v = settlementVariation("london", {
      maxYaw: 0,
      minHeightScale: 2,
      maxHeightScale: 2,
    });
    expect(v.yaw).toBeCloseTo(0, 12);
    expect(v.heightScale).toBe(2);
  });
});
