import { describe, expect, it } from "vitest";

import { PropKindIds } from "../data/props";
import { PassMask } from "../model/pass-mask";
import { FixtureMapBuilder } from "./fixture-map-builder";
import { hatchSpace, hatchTiles, snapshotMap } from "./hatch-space";

describe("hatchTiles", () => {
  it("lists the origin first, respects walls and props, and stays inside the radius", () => {
    const map = new FixtureMapBuilder(7, 7, 1)
      .fillGround()
      .wall({ x: 3, y: 0, z: 3 }, "e", "solid")
      .prop(PropKindIds.BOULDER, { x: 3, y: 0, z: 2 })
      .deploy([{ x: 0, y: 0, z: 0 }])
      .build();
    const snapshot = snapshotMap(map);
    const origin = { x: 3, y: 0, z: 3 };
    const tiles = hatchTiles(snapshot, origin, 1, PassMask.INFANTRY);
    expect(tiles[0]).toMatchObject(origin);
    // West and south are open; east is walled off; north holds a boulder.
    expect(tiles.map((t) => `${t.x},${t.z}`).sort()).toEqual(
      ["2,3", "3,3", "3,4"].sort(),
    );
    expect(hatchSpace(snapshot, origin, 1, PassMask.INFANTRY)).toBe(3);
    // A wider radius reaches the far side of the wall around it.
    expect(hatchSpace(snapshot, origin, 2, PassMask.INFANTRY)).toBeGreaterThan(
      3,
    );
    for (const tile of hatchTiles(snapshot, origin, 2, PassMask.INFANTRY)) {
      expect(
        Math.abs(tile.x - origin.x) + Math.abs(tile.z - origin.z),
      ).toBeLessThanOrEqual(2);
    }
  });

  it("returns nothing for an origin the class cannot stand on", () => {
    const map = new FixtureMapBuilder(3, 3, 1)
      .fillGround()
      .prop(PropKindIds.BOULDER, { x: 1, y: 0, z: 1 })
      .deploy([{ x: 0, y: 0, z: 0 }])
      .build();
    const snapshot = snapshotMap(map);
    expect(
      hatchTiles(snapshot, { x: 1, y: 0, z: 1 }, 2, PassMask.INFANTRY),
    ).toEqual([]);
    expect(
      hatchTiles(snapshot, { x: 1, y: 1, z: 1 }, 2, PassMask.INFANTRY),
    ).toEqual([]);
  });
});
