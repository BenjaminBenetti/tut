import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { CoverLevel } from "../../mapgen/model/cover";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import { DEMOLITION_TUNING } from "../data/demolition-tuning";
import { demolish } from "./demolition-service";
import { hasLineOfSight } from "./sight-service";
import { fixtureAttackDeps, openField } from "./tactical-fixtures.test-helper";

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });
const { structures } = fixtureAttackDeps();

describe("demolish", () => {
  it("removes a light prop at force 1 and restores the tile it stood on", () => {
    const map = openField().prop(PropKindIds.BARRIER, at(2, 2)).build();
    const before = new TileIndex(map).getAt(at(2, 2))!;
    expect(before.pass).toBe(PassMask.NONE);
    expect(before.coverProvided).toBe(CoverLevel.LOW);

    const result = demolish(map, [at(2, 2)], 1, structures, DEMOLITION_TUNING);
    expect(result.props.map((p) => p.kind)).toEqual([PropKindIds.BARRIER]);
    expect(result.map.props).toHaveLength(0);
    const after = new TileIndex(result.map).getAt(at(2, 2))!;
    expect(after.propId).toBeUndefined();
    expect(after.pass).toBe(PassMask.ALL);
    expect(after.coverProvided).toBe(CoverLevel.NONE);
    expect(after.blocksLos).toBe(false);
    // The input map is untouched.
    expect(new TileIndex(map).getAt(at(2, 2))!.pass).toBe(PassMask.NONE);
  });

  it("leaves a heavy prop standing at force 1 and takes it at force 2", () => {
    const map = openField().prop(PropKindIds.DUMPSTER, at(2, 2)).build();
    const light = demolish(map, [at(2, 2)], 1, structures, DEMOLITION_TUNING);
    expect(light.props).toEqual([]);
    expect(light.map).toBe(map);
    const heavy = demolish(map, [at(2, 2)], 2, structures, DEMOLITION_TUNING);
    expect(heavy.props.map((p) => p.kind)).toEqual([PropKindIds.DUMPSTER]);
    expect(new TileIndex(heavy.map).getAt(at(2, 2))!.blocksLos).toBe(false);
  });

  it("never touches a boulder, and does nothing at force 0", () => {
    const map = openField()
      .prop(PropKindIds.BOULDER, at(2, 2))
      .prop(PropKindIds.FENCE, at(3, 3))
      .build();
    expect(
      demolish(map, [at(2, 2)], 9, structures, DEMOLITION_TUNING).props,
    ).toEqual([]);
    expect(
      demolish(map, [at(3, 3)], 0, structures, DEMOLITION_TUNING).map,
    ).toBe(map);
  });

  it("removes a two-tile car whole when either tile is in the footprint", () => {
    const map = openField()
      .prop(PropKindIds.CAR, at(2, 2), 0, [at(2, 2), at(3, 2)])
      .build();
    const result = demolish(map, [at(3, 2)], 1, structures, DEMOLITION_TUNING);
    expect(result.props).toHaveLength(1);
    const index = new TileIndex(result.map);
    expect(index.getAt(at(2, 2))!.pass).toBe(PassMask.ALL);
    expect(index.getAt(at(3, 2))!.pass).toBe(PassMask.ALL);
    expect(index.getAt(at(2, 2))!.propId).toBeUndefined();
  });

  it("demolishes an entire tall shell and reopens its elevated firing lane", () => {
    const cells = Array.from({ length: 16 }, (_, i) =>
      at(2 + (i % 4), 2 + Math.floor(i / 4)),
    );
    const from = { x: 0, y: 4, z: 3 };
    const to = { x: 7, y: 4, z: 3 };
    const map = openField()
      .fillGround(0, SurfaceIds.INFESTED)
      .tile(from, SurfaceIds.GRASS)
      .tile(to, SurfaceIds.GRASS)
      .prop(PropKindIds.INFESTED_CARAPACE_KEEP, at(2, 2), 0, cells)
      .build();
    expect(hasLineOfSight(map, from, to)).toBe(false);
    const light = demolish(map, [at(5, 5)], 1, structures, DEMOLITION_TUNING);
    expect(light.map).toBe(map);
    const result = demolish(map, [at(5, 5)], 2, structures, DEMOLITION_TUNING);
    expect(result.props).toHaveLength(1);
    expect(result.map.props).toEqual([]);
    expect(hasLineOfSight(result.map, from, to)).toBe(true);
    expect(hasLineOfSight(result.map, to, from)).toBe(true);
    const index = new TileIndex(result.map);
    for (const cell of cells) {
      expect(index.getAt(cell)).toMatchObject({
        surface: SurfaceIds.INFESTED,
        pass: PassMask.ALL,
        blocksLos: false,
        coverProvided: CoverLevel.NONE,
      });
      expect(index.getAt(cell)).not.toHaveProperty("propId");
      expect(index.getAt(cell)).not.toHaveProperty("sightHeight");
    }
    expect(new TileIndex(map).getAt(at(5, 5))?.sightHeight).toBe(6);
    expect(hasLineOfSight(map, from, to)).toBe(false);
  });

  it("knocks down a wall on both tiles that share it, once, at the kind's force", () => {
    const map = openField()
      .wall(at(2, 2), "e", "half")
      .wall(at(2, 2), "s", "solid")
      .build();
    const light = demolish(map, [at(2, 2)], 1, structures, DEMOLITION_TUNING);
    expect(light.walls).toEqual([{ tile: at(2, 2), side: "e", kind: "half" }]);
    const index = new TileIndex(light.map);
    expect(index.getAt(at(2, 2))!.walls).toEqual({ s: "solid" });
    expect(index.getAt(at(3, 2))!.walls).toEqual({});

    // Both tiles of the edge in the footprint: still one wall down.
    const both = demolish(
      map,
      [at(2, 2), at(3, 2)],
      1,
      structures,
      DEMOLITION_TUNING,
    );
    expect(both.walls).toHaveLength(1);

    const heavy = demolish(map, [at(2, 2)], 3, structures, DEMOLITION_TUNING);
    expect(heavy.walls.map((w) => w.kind).sort()).toEqual(["half", "solid"]);
    expect(new TileIndex(heavy.map).getAt(at(2, 3))!.walls).toEqual({});
  });

  it("returns the very same map when nothing in the footprint can fall", () => {
    const map = openField().build();
    const result = demolish(
      map,
      [at(1, 1), at(2, 2)],
      3,
      structures,
      DEMOLITION_TUNING,
    );
    expect(result.map).toBe(map);
    expect(result.props).toEqual([]);
    expect(result.walls).toEqual([]);
  });
});
