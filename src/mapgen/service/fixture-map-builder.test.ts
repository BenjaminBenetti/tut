import { describe, expect, it } from "vitest";

import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { CoverLevel } from "../model/cover";
import { PassMask } from "../model/pass-mask";
import { FixtureMapBuilder } from "./fixture-map-builder";
import { TileIndex } from "./tile-index";

describe("FixtureMapBuilder", () => {
  it("fills ground with the surface's default passability", () => {
    const map = new FixtureMapBuilder(3, 2, 1)
      .fillGround(0, SurfaceIds.WATER)
      .build();
    expect(map.tiles).toHaveLength(6);
    expect(map.tiles.every((tile) => tile.pass === PassMask.NONE)).toBe(true);
  });

  it("mirrors walls onto the neighbour and clears both sides", () => {
    const builder = new FixtureMapBuilder(2, 1, 1)
      .fillGround()
      .wall({ x: 0, y: 0, z: 0 }, "e", "door");
    let index = new TileIndex(builder.build());
    expect(index.get(0, 0, 0)?.walls.e).toBe("door");
    expect(index.get(1, 0, 0)?.walls.w).toBe("door");

    builder.wall({ x: 1, y: 0, z: 0 }, "w", undefined);
    index = new TileIndex(builder.build());
    expect(index.get(0, 0, 0)?.walls.e).toBeUndefined();
    expect(index.get(1, 0, 0)?.walls.w).toBeUndefined();
  });

  it("makes prop tiles impassable with the prop's cover", () => {
    const map = new FixtureMapBuilder(1, 1, 1)
      .fillGround()
      .prop(PropKindIds.CAR, { x: 0, y: 0, z: 0 }, 1)
      .build();
    const tile = map.tiles[0];
    expect(tile?.pass).toBe(PassMask.NONE);
    expect(tile?.coverProvided).toBe(CoverLevel.HIGH);
    expect(tile?.propId).toBe(map.props[0]?.id);
    expect(map.props[0]?.rotation).toBe(1);
    expect(tile).not.toHaveProperty("sightHeight");
  });

  it("keeps carapace pieces' opaque heights separate from their open interior", () => {
    const map = new FixtureMapBuilder(3, 3, 5)
      .fillGround()
      .prop(PropKindIds.INFESTED_CARAPACE_WALL_RIDGE, { x: 0, y: 0, z: 1 })
      .prop(PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS, { x: 1, y: 0, z: 0 })
      .prop(PropKindIds.INFESTED_CARAPACE_WALL_BROKEN, { x: 2, y: 0, z: 1 })
      .build();
    const occupied = map.tiles.filter((tile) => tile.propId !== undefined);
    expect(occupied).toHaveLength(3);
    const index = new TileIndex(map);
    expect(index.get(0, 0, 1)?.sightHeight).toBe(3);
    expect(index.get(1, 0, 0)?.sightHeight).toBe(4);
    expect(index.get(2, 0, 1)).not.toHaveProperty("sightHeight");
    expect(index.get(1, 0, 1)).toMatchObject({
      pass: PassMask.ALL,
      blocksLos: false,
      coverProvided: CoverLevel.NONE,
    });
    expect(index.get(1, 0, 1)).not.toHaveProperty("sightHeight");
    expect(index.get(1, 0, 1)).not.toHaveProperty("propId");
  });

  it("defaults extraction to the first deploy zone", () => {
    const tiles = [{ x: 0, y: 0, z: 0 }];
    const map = new FixtureMapBuilder(1, 1, 1)
      .fillGround()
      .deploy(tiles)
      .build();
    expect(map.hooks.extraction.tiles).toEqual(tiles);
    expect(map.hooks.extraction.kind).toBe("extraction");
  });

  it("throws when patching or walling a tile that does not exist", () => {
    const builder = new FixtureMapBuilder(2, 2, 1);
    expect(() => builder.patchTile({ x: 0, y: 0, z: 0 }, {})).toThrow(
      /no tile/,
    );
    expect(() => builder.wall({ x: 1, y: 0, z: 1 }, "n", "solid")).toThrow(
      /no tile/,
    );
  });
});
