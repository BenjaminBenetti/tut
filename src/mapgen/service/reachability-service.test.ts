import { describe, expect, it } from "vitest";

import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { PassMask } from "../model/pass-mask";
import type { TacticalMap } from "../model/tactical-map";
import { FixtureMapBuilder } from "./fixture-map-builder";
import { ReachabilityService, wallKindBlocks } from "./reachability-service";
import { TileIndex } from "./tile-index";

/** A 5×1 strip of grass, two levels tall. */
function strip(): FixtureMapBuilder {
  return new FixtureMapBuilder(5, 1, 2).fillGround();
}

function service(map: TacticalMap): {
  index: TileIndex;
  reach: ReachabilityService;
} {
  const index = new TileIndex(map);
  return { index, reach: new ReachabilityService(index, map.connectors) };
}

function reachableXs(
  map: TacticalMap,
  unitClass: typeof PassMask.INFANTRY | typeof PassMask.MECH,
): number[] {
  const { index, reach } = service(map);
  const keys = reach.reachableFrom([{ x: 0, y: 0, z: 0 }], unitClass);
  return map.tiles
    .filter((tile) => keys.has(index.keyOf(tile)))
    .map((tile) => tile.x)
    .sort((a, b) => a - b);
}

describe("ReachabilityService", () => {
  it("reaches every open tile on flat ground for both classes", () => {
    const map = strip().build();
    expect(reachableXs(map, PassMask.INFANTRY)).toEqual([0, 1, 2, 3, 4]);
    expect(reachableXs(map, PassMask.MECH)).toEqual([0, 1, 2, 3, 4]);
  });

  it("stops at solid walls and windows for everyone, doors for mechs only", () => {
    const solid = strip().wall({ x: 1, y: 0, z: 0 }, "e", "solid").build();
    expect(reachableXs(solid, PassMask.INFANTRY)).toEqual([0, 1]);
    expect(reachableXs(solid, PassMask.MECH)).toEqual([0, 1]);

    const window = strip().wall({ x: 1, y: 0, z: 0 }, "e", "window").build();
    expect(reachableXs(window, PassMask.INFANTRY)).toEqual([0, 1]);

    const door = strip().wall({ x: 1, y: 0, z: 0 }, "e", "door").build();
    expect(reachableXs(door, PassMask.INFANTRY)).toEqual([0, 1, 2, 3, 4]);
    expect(reachableXs(door, PassMask.MECH)).toEqual([0, 1]);
  });

  it("treats a one-sided wall as present", () => {
    const map = strip()
      .wallOneSided({ x: 2, y: 0, z: 0 }, "w", "solid")
      .build();
    expect(reachableXs(map, PassMask.INFANTRY)).toEqual([0, 1]);
  });

  it("treats a level change without a connector as a cliff", () => {
    const map = strip()
      .removeTile({ x: 3, y: 0, z: 0 })
      .tile({ x: 3, y: 1, z: 0 }, SurfaceIds.ROCK)
      .build();
    expect(reachableXs(map, PassMask.INFANTRY)).toEqual([0, 1, 2]);
    expect(reachableXs(map, PassMask.MECH)).toEqual([0, 1, 2]);
  });

  it("crosses ramps with both classes and stairs with infantry only", () => {
    const builder = strip()
      .removeTile({ x: 3, y: 0, z: 0 })
      .tile({ x: 3, y: 1, z: 0 }, SurfaceIds.ROCK);
    builder.connector("ramp", { x: 2, y: 0, z: 0 }, { x: 3, y: 1, z: 0 });
    const ramped = builder.build();
    // (4,0,0) stays cut off: dropping from level 1 needs a connector too.
    expect(reachableXs(ramped, PassMask.INFANTRY)).toEqual([0, 1, 2, 3]);
    expect(reachableXs(ramped, PassMask.MECH)).toEqual([0, 1, 2, 3]);

    const stairs = strip()
      .removeTile({ x: 3, y: 0, z: 0 })
      .tile({ x: 3, y: 1, z: 0 }, SurfaceIds.FLOOR)
      .tile({ x: 2, y: 0, z: 0 }, SurfaceIds.STAIRS, { pass: PassMask.ALL });
    stairs.connector("stairs", { x: 2, y: 0, z: 0 }, { x: 3, y: 1, z: 0 });
    const stairMap = stairs.build();
    expect(reachableXs(stairMap, PassMask.INFANTRY)).toEqual([0, 1, 2, 3]);
    expect(reachableXs(stairMap, PassMask.MECH)).toEqual([0, 1, 2]);
  });

  it("never steps onto a tile the class cannot occupy", () => {
    const map = strip().prop(PropKindIds.BOULDER, { x: 2, y: 0, z: 0 }).build();
    const { index, reach } = service(map);
    const from = index.get(1, 0, 0);
    expect(from).toBeDefined();
    if (from === undefined) {
      return;
    }
    expect(reach.neighbours(from, PassMask.INFANTRY).map((t) => t.x)).toEqual([
      0,
    ]);
    expect(reachableXs(map, PassMask.MECH)).toEqual([0, 1]);
  });

  it("answers canStep symmetrically for adjacent tiles", () => {
    const map = strip().wall({ x: 0, y: 0, z: 0 }, "e", "door").build();
    const { index, reach } = service(map);
    const a = index.get(0, 0, 0);
    const b = index.get(1, 0, 0);
    const c = index.get(3, 0, 0);
    if (a === undefined || b === undefined || c === undefined) {
      throw new Error("fixture tiles missing");
    }
    expect(reach.canStep(a, b, PassMask.INFANTRY)).toBe(true);
    expect(reach.canStep(b, a, PassMask.INFANTRY)).toBe(true);
    expect(reach.canStep(a, b, PassMask.MECH)).toBe(false);
    expect(reach.canStep(a, c, PassMask.INFANTRY)).toBe(false);
  });

  it("reports connectivity of a tile set per class", () => {
    const map = strip().wall({ x: 1, y: 0, z: 0 }, "e", "door").build();
    const { reach } = service(map);
    const all = map.tiles.map(({ x, y, z }) => ({ x, y, z }));
    expect(reach.isConnected(all, PassMask.INFANTRY)).toBe(true);
    expect(reach.isConnected(all, PassMask.MECH)).toBe(false);
    expect(reach.isConnected([], PassMask.MECH)).toBe(true);
  });

  it("ignores connectors whose endpoints are missing", () => {
    const builder = strip();
    builder.connector("ramp", { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 1 });
    const map = builder.build();
    expect(() => service(map)).not.toThrow();
    expect(reachableXs(map, PassMask.INFANTRY)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("wallKindBlocks", () => {
  it("lets only infantry through doors and nobody through the rest", () => {
    expect(wallKindBlocks(undefined, PassMask.MECH)).toBe(false);
    expect(wallKindBlocks("door", PassMask.INFANTRY)).toBe(false);
    expect(wallKindBlocks("door", PassMask.MECH)).toBe(true);
    expect(wallKindBlocks("solid", PassMask.INFANTRY)).toBe(true);
    expect(wallKindBlocks("window", PassMask.INFANTRY)).toBe(true);
  });
});

describe("half walls", () => {
  it("lets infantry vault a parapet and makes a mech go round (#508)", () => {
    const map = new FixtureMapBuilder(3, 1, 1)
      .fillGround()
      .wall({ x: 1, y: 0, z: 0 }, "e", "half")
      .build();
    const index = new TileIndex(map);
    const reach = new ReachabilityService(index, map.connectors);
    const from = index.getAt({ x: 1, y: 0, z: 0 });
    const to = index.getAt({ x: 2, y: 0, z: 0 });
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    if (!from || !to) return;
    expect(reach.canStep(from, to, PassMask.INFANTRY)).toBe(true);
    expect(reach.canStep(from, to, PassMask.MECH)).toBe(false);
  });
});
