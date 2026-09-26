import { STOREY_LAYERS } from "../../core/model/elevation";
import type { GridPos } from "../../core/model/grid";
import { manhattanDistance } from "../../core/service/grid-math";
import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { eyeReaches, eyeSweep, tileOfKey } from "./eye-sweep-service";
import { hasLineOfSight } from "./sight-service";

// ===========================================
// Fixtures
// ===========================================

const EYE: GridPos = { x: 4, y: 0, z: 4 };
const RANGE = 3;
/** Inside the range, behind the boulder at (4, 3). */
const HIDDEN: GridPos = { x: 4, y: 0, z: 1 };
/** In plain view but one step past the range. */
const TOO_FAR: GridPos = { x: 0, y: 0, z: 4 };
/** A second level over (5, 4), so one column holds two tiles. */
const LOFT: GridPos = { x: 5, y: STOREY_LAYERS, z: 4 };

/**
 * A 9×11 field (not square, so width and depth cannot stand in for
 * each other) with a sight-blocking boulder north of the eye, a solid
 * wall east of it and a loft over the tile beside it.
 */
function arena(): TacticalMap {
  return new FixtureMapBuilder(9, 11, 2 * STOREY_LAYERS)
    .fillGround()
    .prop(PropKindIds.BOULDER, { x: 4, y: 0, z: 3 })
    .wall({ x: 5, y: 0, z: 4 }, "e", "solid")
    .tile(LOFT, SurfaceIds.GRASS)
    .build();
}

/**
 * The same answer derived another way: every tile on the map, kept when
 * range and line allow it, ordered by the sweep's `dx`, `dz`, `y`.
 */
function expected(
  map: TacticalMap,
  eye: GridPos,
  range: number,
  index: TileIndex,
): number[] {
  return map.tiles
    .filter(
      (tile) =>
        manhattanDistance(eye, tile) <= range &&
        hasLineOfSight(map, eye, tile, index),
    )
    .sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y)
    .map((tile) => index.keyOf(tile));
}

// ===========================================
// Reaching
// ===========================================

describe("eyeReaches", () => {
  it("needs both the range and a clear line", () => {
    const map = arena();
    const index = new TileIndex(map);
    expect(eyeReaches(map, EYE, RANGE, { x: 4, y: 0, z: 6 }, index)).toBe(true);
    expect(eyeReaches(map, EYE, RANGE, HIDDEN, index)).toBe(false);
    expect(eyeReaches(map, EYE, RANGE, TOO_FAR, index)).toBe(false);
    expect(eyeReaches(map, EYE, RANGE + 1, TOO_FAR, index)).toBe(true);
  });
});

// ===========================================
// Sweeping
// ===========================================

describe("eyeSweep", () => {
  it("lists every tile the eye reaches, in sweep order", () => {
    const map = arena();
    const index = new TileIndex(map);
    const swept = Array.from(eyeSweep(map, EYE, RANGE, index));
    expect(swept).toEqual(expected(map, EYE, RANGE, index));
    expect(swept).not.toContain(index.keyOf(HIDDEN));
    expect(swept).not.toContain(index.keyOf(TOO_FAR));
    expect(swept).toContain(index.keyOf(LOFT));
    expect(swept.indexOf(index.keyOf(LOFT))).toBe(
      swept.indexOf(index.keyOf({ ...LOFT, y: 0 })) + 1,
    );
  });

  it("remembers a sweep per index, eye tile and range", () => {
    const map = arena();
    const index = new TileIndex(map);
    const first = eyeSweep(map, EYE, RANGE, index);
    expect(eyeSweep(map, { ...EYE }, RANGE, index)).toBe(first);
    const wider = eyeSweep(map, EYE, RANGE + 1, index);
    expect(wider).not.toBe(first);
    expect(Array.from(wider)).toEqual(expected(map, EYE, RANGE + 1, index));
    const again = eyeSweep(map, EYE, RANGE, new TileIndex(map));
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });

  it("sweeps an eye off the grid without a key, as the walk always did", () => {
    const map = arena();
    const index = new TileIndex(map);
    const offGrid: GridPos = { x: -1, y: 0, z: 1 };
    const swept = Array.from(eyeSweep(map, offGrid, RANGE, index));
    expect(swept.length).toBeGreaterThan(0);
    expect(swept).toEqual(expected(map, offGrid, RANGE, index));
    expect(eyeSweep(map, offGrid, RANGE, index)).not.toBe(
      eyeSweep(map, offGrid, RANGE, index),
    );
  });
});

// ===========================================
// Keys
// ===========================================

describe("tileOfKey", () => {
  it("names the tile every key on the grid came from", () => {
    const map = arena();
    const index = new TileIndex(map);
    for (const tile of map.tiles) {
      expect(tileOfKey(index.keyOf(tile), index)).toEqual({
        x: tile.x,
        y: tile.y,
        z: tile.z,
      });
    }
  });
});
