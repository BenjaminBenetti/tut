import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { wallFamilyFor, wallModel } from "../data/map-model-table";
import { tileTop, tileTopCentre } from "../view/tactical-map-view";
import type { ModelPlacement } from "./map-model-resolver";
import {
  GROUND_SLAB_THICKNESS,
  OVERLAY_LIFT,
} from "../data/tactical-overlay-palette";
import {
  mapModelIds,
  resolveMapModels,
  WATER_RECESS,
} from "./map-model-resolver";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });

/** An 8×8 dirt field, so any tile made road has non-road neighbours by default. */
function field(): FixtureMapBuilder {
  return new FixtureMapBuilder(8, 8, 2).fillGround(0, SurfaceIds.DIRT);
}

/** The tile placement covering a coordinate, if one resolved. */
function tileAt(
  map: TacticalMap,
  coord: TileCoord,
): ModelPlacement | undefined {
  return resolveMapModels(map).tiles.find(
    (p) =>
      p.position.x === coord.x + 0.5 &&
      p.position.z === coord.z + 0.5 &&
      p.level === coord.y,
  );
}

/** Paints every coordinate with the surface and returns the built map. */
function painted(surface: string, coords: readonly TileCoord[]): TacticalMap {
  const b = field();
  for (const coord of coords) {
    b.tile(coord, surface);
  }
  return b.build();
}

// ===========================================
// Tests
// ===========================================

describe("resolveMapModels — surfaces", () => {
  it("puts each plain surface's top face on the tile top (#557)", () => {
    const map = painted(SurfaceIds.GRASS, [at(1, 1)]);
    const placement = tileAt(map, at(1, 1));
    expect(placement?.modelId).toBe("tile.ground.grass");
    expect(placement?.turns).toBe(0);
    // The slab pivots at its centre, so the pivot goes half a thickness
    // below for the surface a unit stands on to land on `tileTop` —
    // where the preview box has always put its own top face. Pivoting on
    // `tileTop` is what left everything placed on a tile half a slab low.
    expect(placement?.position.y).toBe(tileTop(0) - GROUND_SLAB_THICKNESS / 2);
    expect(
      (placement?.position.y ?? 0) + GROUND_SLAB_THICKNESS / 2,
    ).toBeCloseTo(tileTop(0), 10);
  });

  it("recesses water below the surrounding ground", () => {
    const map = painted(SurfaceIds.WATER, [at(2, 2)]);
    expect(tileAt(map, at(2, 2))?.modelId).toBe("tile.ground.water");
    expect(tileAt(map, at(2, 2))?.position.y).toBe(
      tileTop(0) - GROUND_SLAB_THICKNESS / 2 - WATER_RECESS,
    );
  });

  it("maps interior surfaces to the building kit", () => {
    const b = field();
    b.tile(at(1, 1, 1), SurfaceIds.FLOOR, { buildingId: "b", floorIndex: 0 });
    b.tile(at(2, 1, 1), SurfaceIds.ROOF, { buildingId: "b", floorIndex: 1 });
    b.tile(at(3, 1, 1), SurfaceIds.STAIRS, { buildingId: "b", floorIndex: 0 });
    const map = b.build();
    expect(tileAt(map, at(1, 1, 1))?.modelId).toBe("building.floor");
    expect(tileAt(map, at(2, 1, 1))?.modelId).toBe("building.roof");
    expect(tileAt(map, at(3, 1, 1))?.modelId).toBe("building.stairs");
  });

  it("skips a surface with no registered art rather than substituting one", () => {
    const b = field();
    b.tile(at(4, 4), "lava");
    const map = b.build();
    expect(tileAt(map, at(4, 4))).toBeUndefined();
    // and the rest of the map still resolves
    expect(resolveMapModels(map).tiles.length).toBe(map.tiles.length - 1);
  });
});

describe("resolveMapModels — road junctions", () => {
  it("runs a straight east-west unturned and a north-south a quarter turn", () => {
    const eastWest = painted(SurfaceIds.ROAD, [at(1, 3), at(2, 3), at(3, 3)]);
    expect(tileAt(eastWest, at(2, 3))).toMatchObject({
      modelId: "tile.city.road-straight",
      turns: 0,
    });
    const northSouth = painted(SurfaceIds.ROAD, [at(3, 1), at(3, 2), at(3, 3)]);
    expect(tileAt(northSouth, at(3, 2))).toMatchObject({
      modelId: "tile.city.road-straight",
      turns: 1,
    });
  });

  it("uses the cross piece where four roads meet", () => {
    const map = painted(SurfaceIds.ROAD, [
      at(3, 3),
      at(2, 3),
      at(4, 3),
      at(3, 2),
      at(3, 4),
    ]);
    expect(tileAt(map, at(3, 3))).toMatchObject({
      modelId: "tile.city.road-cross",
      turns: 0,
    });
  });

  it("turns the T so its closed side faces the gap", () => {
    // Roads east, south and west of (3,3); nothing north. The piece is
    // authored with its gap north, so it stays unturned.
    const openNorth = painted(SurfaceIds.ROAD, [
      at(3, 3),
      at(2, 3),
      at(4, 3),
      at(3, 4),
    ]);
    expect(tileAt(openNorth, at(3, 3))).toMatchObject({
      modelId: "tile.city.road-t",
      turns: 0,
    });
    // Gap to the east instead: one quarter turn clockwise.
    const openEast = painted(SurfaceIds.ROAD, [
      at(3, 3),
      at(2, 3),
      at(3, 2),
      at(3, 4),
    ]);
    expect(tileAt(openEast, at(3, 3))).toMatchObject({
      modelId: "tile.city.road-t",
      turns: 1,
    });
  });

  it("turns the corner onto the pair it joins", () => {
    // Authored joining east and south, so an east-south bend is unturned.
    const eastSouth = painted(SurfaceIds.ROAD, [at(3, 3), at(4, 3), at(3, 4)]);
    expect(tileAt(eastSouth, at(3, 3))).toMatchObject({
      modelId: "tile.city.road-corner",
      turns: 0,
    });
    // South-west is one turn on from that.
    const southWest = painted(SurfaceIds.ROAD, [at(3, 3), at(3, 4), at(2, 3)]);
    expect(tileAt(southWest, at(3, 3))).toMatchObject({
      modelId: "tile.city.road-corner",
      turns: 1,
    });
    // North-east is three.
    const northEast = painted(SurfaceIds.ROAD, [at(3, 3), at(3, 2), at(4, 3)]);
    expect(tileAt(northEast, at(3, 3))).toMatchObject({
      modelId: "tile.city.road-corner",
      turns: 3,
    });
  });

  it("gives a lone road tile the straight piece", () => {
    const map = painted(SurfaceIds.ROAD, [at(5, 5)]);
    expect(tileAt(map, at(5, 5))).toMatchObject({
      modelId: "tile.city.road-straight",
      turns: 0,
    });
  });

  it("bends a sidewalk but never junctions it, since the kit ships no T or cross", () => {
    const bend = painted(SurfaceIds.SIDEWALK, [at(3, 3), at(4, 3), at(3, 4)]);
    expect(tileAt(bend, at(3, 3))?.modelId).toBe("tile.city.sidewalk-corner");
    const crossing = painted(SurfaceIds.SIDEWALK, [
      at(3, 3),
      at(2, 3),
      at(4, 3),
      at(3, 2),
      at(3, 4),
    ]);
    expect(tileAt(crossing, at(3, 3))?.modelId).toBe("tile.city.sidewalk");
  });

  it("does not let a road count a sidewalk as a road neighbour", () => {
    const b = field();
    b.tile(at(3, 3), SurfaceIds.ROAD);
    b.tile(at(4, 3), SurfaceIds.SIDEWALK);
    b.tile(at(3, 4), SurfaceIds.SIDEWALK);
    const map = b.build();
    expect(tileAt(map, at(3, 3))?.modelId).toBe("tile.city.road-straight");
  });
});

describe("resolveMapModels — walls", () => {
  it("stands a wall on its edge, running along it", () => {
    const b = field();
    b.wall(at(2, 2), "n", "solid");
    b.wall(at(5, 5), "w", "window");
    const { walls } = resolveMapModels(b.build());
    const north = walls.find(
      (w) => w.modelId === wallModel("solid", wallFamilyFor(undefined)),
    );
    expect(north?.position).toEqual({ x: 2.5, y: tileTop(0), z: 2 });
    expect(north?.turns).toBe(0);
    const west = walls.find(
      (w) => w.modelId === wallModel("window", wallFamilyFor(undefined)),
    );
    expect(west?.position).toEqual({ x: 5, y: tileTop(0), z: 5.5 });
    expect(west?.turns).toBe(1);
  });

  it("draws a shared wall once, from the north or west side", () => {
    const b = field();
    b.wall(at(2, 2), "s", "door");
    const { walls } = resolveMapModels(b.build());
    const doors = walls.filter(
      (w) => w.modelId === wallModel("door", wallFamilyFor(undefined)),
    );
    expect(doors).toHaveLength(1);
    // (2,3)'s north edge is the same edge as (2,2)'s south.
    expect(doors[0]?.position).toEqual({ x: 2.5, y: tileTop(0), z: 3 });
  });

  it("draws one building in one family, so it is not a patchwork (#511)", () => {
    const b = field();
    // A four-tile building, walled all round its outside.
    for (const [x, z] of [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ] as const) {
      b.patchTile(at(x, z), { buildingId: "b1" });
    }
    b.wall(at(2, 2), "n", "solid");
    b.wall(at(3, 2), "n", "window");
    b.wall(at(2, 2), "w", "door");
    b.wall(at(2, 3), "w", "solid");
    const { walls } = resolveMapModels(b.build());
    const family = wallFamilyFor("b1");
    expect(walls.length).toBeGreaterThan(0);
    for (const wall of walls) {
      const kinds = ["solid", "window", "door"] as const;
      const drawn = kinds.map((kind) => wallModel(kind, family));
      expect(drawn, `${wall.modelId} in ${family}`).toContain(wall.modelId);
    }
  });

  it("gives two buildings on a block different families", () => {
    const b = field();
    b.patchTile(at(2, 2), { buildingId: "b1" });
    b.patchTile(at(6, 6), { buildingId: "tower" });
    b.wall(at(2, 2), "n", "solid");
    b.wall(at(6, 6), "n", "solid");
    // Guard the fixture: if the hash ever moves these two together the
    // test should say so rather than quietly stop testing anything.
    expect(wallFamilyFor("b1")).not.toBe(wallFamilyFor("tower"));
    const { walls } = resolveMapModels(b.build());
    const at22 = walls.find((w) => w.tile.x === 2 && w.tile.z === 2);
    const at66 = walls.find((w) => w.tile.x === 6 && w.tile.z === 6);
    expect(at22?.modelId).toBe(wallModel("solid", wallFamilyFor("b1")));
    expect(at66?.modelId).toBe(wallModel("solid", wallFamilyFor("tower")));
    expect(at22?.modelId).not.toBe(at66?.modelId);
  });

  it("draws a wall belonging to no building in brick, so a tower is brick to the pavement", () => {
    const b = field();
    b.wall(at(2, 2), "n", "solid");
    const { walls } = resolveMapModels(b.build());
    expect(walls[0]?.modelId).toBe("building.wall");
  });

  it("draws the same map the same way twice, so a reload does not reskin it", () => {
    const build = () => {
      const b = field();
      b.patchTile(at(2, 2), { buildingId: "b1" });
      b.patchTile(at(6, 6), { buildingId: "tower" });
      b.wall(at(2, 2), "n", "solid");
      b.wall(at(6, 6), "n", "window");
      return resolveMapModels(b.build()).walls.map((w) => w.modelId);
    };
    expect(build()).toEqual(build());
  });

  it("draws an outer wall with nothing beyond it", () => {
    const b = new FixtureMapBuilder(2, 2, 1).fillGround(0, SurfaceIds.DIRT);
    b.wall(at(1, 1), "s", "solid");
    const { walls } = resolveMapModels(b.build());
    expect(walls).toHaveLength(1);
    expect(walls[0]?.position).toEqual({ x: 1.5, y: tileTop(0), z: 2 });
  });
});

describe("resolveMapModels — props", () => {
  it("places a prop at its tile's base centre, turned as mapgen placed it", () => {
    const b = field();
    b.prop(PropKindIds.CRATE, at(2, 2), 2);
    const { props } = resolveMapModels(b.build());
    expect(props).toEqual([
      {
        modelId: "prop.crate",
        level: 0,
        position: { x: 2.5, y: tileTop(0), z: 2.5 },
        turns: 2,
        // Carried so vision can dim or drop it with its tile (#551).
        tile: at(2, 2),
      },
    ]);
  });

  it("maps every well-known prop kind to registered art", () => {
    const b = field();
    const kinds = Object.values(PropKindIds);
    kinds.forEach((kind, i) => {
      b.prop(kind, at(i % 8, Math.floor(i / 8) + 4));
    });
    const { props } = resolveMapModels(b.build());
    expect(props).toHaveLength(kinds.length);
    expect(new Set(props.map((p) => p.modelId)).size).toBe(kinds.length);
  });
});

describe("mapModelIds", () => {
  it("lists each model once across tiles, walls and props", () => {
    const b = field();
    b.tile(at(1, 1), SurfaceIds.GRASS);
    b.tile(at(2, 1), SurfaceIds.GRASS);
    b.wall(at(1, 1), "n", "solid");
    b.prop(PropKindIds.CRATE, at(3, 3));
    const ids = mapModelIds(resolveMapModels(b.build()));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("tile.ground.grass");
    expect(ids).toContain(wallModel("solid", wallFamilyFor(undefined)));
    expect(ids).toContain("prop.crate");
  });
});
// ===========================================
// The tile's top surface (#557)
// ===========================================

describe("everything placed on a tile measures from one plane", () => {
  it("puts the slab's surface, a unit's feet and an overlay in the right order", () => {
    const map = painted(SurfaceIds.GRASS, [at(1, 1)]);
    const placement = tileAt(map, at(1, 1));
    expect(placement).toBeDefined();
    if (!placement) return;

    // The one definition: `tileTop` is the surface a unit stands on.
    const surface = placement.position.y + GROUND_SLAB_THICKNESS / 2;
    expect(surface).toBeCloseTo(tileTop(0), 10);

    // A unit is placed at `tileTopCentre`, so its feet are on it rather
    // than half a slab inside it — the defect this issue is named for.
    expect(tileTopCentre({ x: 1, y: 0, z: 1 }).y).toBeCloseTo(surface, 10);

    // And an overlay clears it, by a nudge rather than by a slab.
    expect(tileTop(0) + OVERLAY_LIFT).toBeGreaterThan(surface);
    expect(tileTop(0) + OVERLAY_LIFT - surface).toBeLessThan(
      GROUND_SLAB_THICKNESS,
    );
  });

  it("holds at every level, not just the ground", () => {
    for (const level of [0, 1]) {
      const map = painted(SurfaceIds.GRASS, [at(1, 1, level)]);
      const placement = tileAt(map, at(1, 1, level));
      expect([
        level,
        (placement?.position.y ?? 0) + GROUND_SLAB_THICKNESS / 2,
      ]).toEqual([level, tileTop(level)]);
    }
  });
});

// ===========================================
// Stairs face their connector (#766)
// ===========================================

describe("resolveMapModels stairs tiles", () => {
  /** A stairs tile at (2, 0, 2) climbing to a raised tile one step `d` away. */
  function climb(d: { x: number; z: number }): TacticalMap {
    const b = new FixtureMapBuilder(5, 5, 2).fillGround();
    b.tile({ x: 2, y: 0, z: 2 }, SurfaceIds.STAIRS);
    b.tile({ x: 2 + d.x, y: 1, z: 2 + d.z }, SurfaceIds.ROCK);
    b.connector(
      "stairs",
      { x: 2, y: 0, z: 2 },
      { x: 2 + d.x, y: 1, z: 2 + d.z },
    );
    return b.build();
  }
  const stairsAt = (map: TacticalMap) =>
    resolveMapModels(map).tiles.find((p) => p.tile.x === 2 && p.tile.z === 2);

  it("turns the model up its connector: south 0, west 1, north 2, east 3", () => {
    // `placementMatrix` rotates -turns·π/2 about Y, so +Z lands on
    // south / west / north / east for turns 0 / 1 / 2 / 3.
    expect(stairsAt(climb({ x: 0, z: 1 }))?.turns).toBe(0);
    expect(stairsAt(climb({ x: -1, z: 0 }))?.turns).toBe(1);
    expect(stairsAt(climb({ x: 0, z: -1 }))?.turns).toBe(2);
    expect(stairsAt(climb({ x: 1, z: 0 }))?.turns).toBe(3);
  });

  it("stands the stairs on the tile top, pivot at its base, not half a slab down", () => {
    const placed = stairsAt(climb({ x: 1, z: 0 }));
    expect(placed?.modelId).toBe("building.stairs");
    expect(placed?.position).toEqual({ x: 2.5, y: tileTop(0), z: 2.5 });
  });

  it("keeps a stairs tile with no connector unturned rather than dropping it", () => {
    const b = new FixtureMapBuilder(5, 5, 2).fillGround();
    b.tile({ x: 2, y: 0, z: 2 }, SurfaceIds.STAIRS);
    const placed = stairsAt(b.build());
    expect(placed?.modelId).toBe("building.stairs");
    expect(placed?.turns).toBe(0);
  });
});

// ===========================================
// Civic parapets (#766)
// ===========================================

describe("resolveMapModels parapets", () => {
  it("draws a raised road's parapet in concrete, not brick", () => {
    // Raised road tiles carry `half` walls and no building id (#607).
    const b = field();
    b.tile({ x: 2, y: 1, z: 2 }, SurfaceIds.ROAD);
    b.wall({ x: 2, y: 1, z: 2 }, "n", "half");
    b.wall({ x: 2, y: 1, z: 2 }, "w", "half");
    const { walls } = resolveMapModels(b.build());
    const parapets = walls.filter((w) => w.tile.x === 2 && w.tile.y === 1);
    expect(parapets.length).toBe(2);
    for (const p of parapets) {
      expect(p.modelId).toBe("building.wall-half-concrete");
    }
  });

  it("keeps a brick building's own parapet in brick", () => {
    const b = field();
    const brick = Array.from({ length: 200 }, (_, i) => `b${String(i)}`).find(
      (id) => wallFamilyFor(id) === "brick",
    );
    if (brick === undefined)
      throw new Error("no id in b0..b199 hashes to brick");
    b.tile({ x: 2, y: 1, z: 2 }, SurfaceIds.ROOF, {
      buildingId: brick,
      floorIndex: 1,
    });
    b.wall({ x: 2, y: 1, z: 2 }, "n", "half");
    const { walls } = resolveMapModels(b.build());
    expect(walls.find((w) => w.tile.x === 2 && w.tile.y === 1)?.modelId).toBe(
      "building.wall-half",
    );
  });
});
