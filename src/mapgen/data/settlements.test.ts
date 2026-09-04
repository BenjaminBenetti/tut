import { describe, expect, it } from "vitest";

import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import type { IntRange } from "../model/settlement-definition";
import { createRegistry } from "../../core/service/definition-registry";
import { SETTLEMENT_DEFINITIONS } from "./settlements";

function expectRange(range: IntRange, label: string, floor: number): void {
  expect(Number.isInteger(range.min), label).toBe(true);
  expect(Number.isInteger(range.max), label).toBe(true);
  expect(range.min, label).toBeGreaterThanOrEqual(floor);
  expect(range.max, label).toBeGreaterThanOrEqual(range.min);
}

describe("settlement definitions", () => {
  const settlements = createRegistry(
    "settlement",
    Object.values(SETTLEMENT_DEFINITIONS),
  );

  it("define every scale exactly once", () => {
    for (const id of SETTLEMENT_SCALES) {
      expect(settlements.has(id), id).toBe(true);
    }
    expect(settlements.ids.length).toBe(SETTLEMENT_SCALES.length);
  });

  it("keep every range ordered and large enough to build on", () => {
    for (const settlement of settlements.values) {
      expectRange(settlement.lotWidth, `${settlement.id} lotWidth`, 3);
      expectRange(settlement.lotDepth, `${settlement.id} lotDepth`, 3);
      expectRange(settlement.buildingCount, `${settlement.id} buildings`, 1);
      expectRange(settlement.floorCount, `${settlement.id} floors`, 1);
      expectRange(settlement.sideStreets, `${settlement.id} sideStreets`, 0);
      expect(settlement.rampSpacing).toBeGreaterThanOrEqual(2);
      expect(Number.isInteger(settlement.roadWidth)).toBe(true);
      expect(settlement.roadWidth).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(settlement.blockJitter)).toBe(true);
      expect(settlement.blockJitter).toBeGreaterThanOrEqual(0);
      if (settlement.roadStyle === "grid") {
        expect(settlement.blockJitter * 2).toBeLessThan(settlement.blockSize);
      }
      expect(settlement.streetPropDensity).toBeGreaterThanOrEqual(0);
      expect(settlement.yardPropDensity).toBeGreaterThanOrEqual(0);
    }
  });

  it("get denser and taller from rural to city", () => {
    const rural = settlements.get("rural");
    const town = settlements.get("town");
    const city = settlements.get("city");
    expect(rural.buildingCount.max).toBeLessThan(town.buildingCount.min);
    expect(town.buildingCount.max).toBeLessThanOrEqual(city.buildingCount.max);
    expect(rural.floorCount.max).toBeLessThanOrEqual(town.floorCount.max);
    expect(town.floorCount.max).toBeLessThanOrEqual(city.floorCount.max);
  });

  it("give the grid style a block size and the others none", () => {
    for (const settlement of settlements.values) {
      if (settlement.roadStyle === "grid") {
        expect(settlement.blockSize, settlement.id).toBeGreaterThanOrEqual(6);
      } else {
        expect(settlement.blockSize, settlement.id).toBe(0);
      }
    }
  });
});
