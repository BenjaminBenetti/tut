import { describe, expect, it } from "vitest";

import { PropKindIds } from "../data/props";
import { HookKinds } from "../model/hook";
import { PassMask } from "../model/pass-mask";
import { FixtureMapBuilder } from "./fixture-map-builder";
import { computeMapMetrics } from "./map-metrics";

describe("computeMapMetrics", () => {
  it("counts cover, walls, interiors, connectors and hatch space on a fixture", () => {
    const map = new FixtureMapBuilder(6, 6, 1)
      .fillGround()
      .prop(PropKindIds.BOULDER, { x: 1, y: 0, z: 1 })
      .wall({ x: 4, y: 0, z: 4 }, "n", "solid")
      .deploy([
        { x: 0, y: 0, z: 5 },
        { x: 1, y: 0, z: 5 },
      ])
      .objective(
        HookKinds.EGG_SPAWNER,
        [{ x: 3, y: 0, z: 3 }],
        PassMask.INFANTRY,
        {
          hatchRadius: 1,
        },
      )
      .build();
    const metrics = computeMapMetrics(map);
    expect(metrics.groundTiles).toBe(36);
    expect(metrics.openTiles).toBe(35);
    // The boulder's four neighbours out of 35 open tiles.
    expect(metrics.coverAdjacency).toBeCloseTo(4 / 35);
    // The wall is mirrored onto (4,3), so two tiles touch it.
    expect(metrics.wallAdjacency).toBeCloseTo(2 / 35);
    expect(metrics.highCoverPer100).toBeCloseTo(100 / 36);
    expect(metrics.lowCoverPer100).toBe(0);
    expect(metrics.interiorPropsPerBuilding).toBe(0);
    expect(metrics.ramps + metrics.stairs + metrics.ladders).toBe(0);
    expect(metrics.maxFloors).toBe(0);
    // The spawner tile plus its four neighbours within radius 1.
    expect(metrics.hatchSpaceMin).toBe(5);
    expect(metrics.hatchSpaceMean).toBe(5);
  });

  it("reports zeros on a map with no objectives or buildings", () => {
    const map = new FixtureMapBuilder(3, 3, 1)
      .fillGround()
      .deploy([{ x: 0, y: 0, z: 0 }])
      .build();
    const metrics = computeMapMetrics(map);
    expect(metrics.hatchSpaceMin).toBe(0);
    expect(metrics.hatchSpaceMean).toBe(0);
    expect(metrics.interiorPropsPerBuilding).toBe(0);
    expect(metrics.coverAdjacency).toBe(0);
  });
});
