import { describe, expect, it } from "vitest";
import { HIVE_ASSAULT } from "../../content/data/mission-types";
import { STOREY_LAYERS } from "../../core/model/elevation";
import type { Rect } from "../../core/model/grid";
import { rectContains } from "../../core/service/grid-math";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Hook } from "../../mapgen/model/hook";
import { allHooks, HookKinds } from "../../mapgen/model/hook";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { freezeDraft } from "../../mapgen/service/draft-freezer";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { createGreatHiveCavernPasses } from "../../mapgen/service/great-hive-cavern-pipeline";
import { missionToMapRecipe } from "../../mapgen/service/mission-map-recipe-adapter";
import { PipelineMapGenerator } from "../../mapgen/service/pipeline-map-generator";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { Mission } from "../../overworld/model/mission";
import type { DrawnDropship } from "../model/drawn-dropship";
import {
  FORWARD_DROPSHIP_GAP,
  FORWARD_DROPSHIP_MAX_LIFT,
  resolveForwardDropships,
} from "./forward-dropship-resolver";

// ===========================================
// Fixtures
// ===========================================

/** The point's floor level in the fixtures. */
const FLOOR = 2;

/** The forward point's square in the fixtures: 4 × 4 from (13, 13). */
const POINT: Rect = { x: 13, z: 13, w: 4, d: 4 };

/** Time for three Great Hive cavern generations on a loaded runner. */
const GENERATION_TIMEOUT_MS = 120_000;

/** The point's tiles on `level`. */
function pointTiles(level = FLOOR): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = POINT.z; z < POINT.z + POINT.d; z++) {
    for (let x = POINT.x; x < POINT.x + POINT.w; x++) {
      tiles.push({ x, y: level, z });
    }
  }
  return tiles;
}

/** A 30 × 30 map of floor on `FLOOR`, reshaped by `shape`, with the point. */
function fixture(
  shape: (builder: FixtureMapBuilder) => FixtureMapBuilder = (b) => b,
): TacticalMap {
  const builder = new FixtureMapBuilder(30, 30, 10)
    .fillGround(FLOOR, SurfaceIds.DIRT)
    .deploy([{ x: 1, y: FLOOR, z: 1 }]);
  return shape(builder)
    .objective(HookKinds.FORWARD_EXTRACTION, pointTiles(), PassMask.ALL)
    .build();
}

/** Raises every column outside `keep` to `level`: rock around a floor. */
function rockOutside(
  builder: FixtureMapBuilder,
  keep: (x: number, z: number) => boolean,
  level: number,
): FixtureMapBuilder {
  for (let z = 0; z < 30; z++) {
    for (let x = 0; x < 30; x++) {
      if (keep(x, z)) continue;
      builder.removeTile({ x, y: FLOOR, z });
      builder.tile({ x, y: level, z }, SurfaceIds.ROCK);
    }
  }
  return builder;
}

/** The columns just past the ramp, as `resolveForwardDropships` reads them. */
function rampFoot(ship: DrawnDropship): { x: number; z: number }[] {
  const f = ship.footprint;
  const across = ship.facing === "n" || ship.facing === "s";
  return Array.from({ length: across ? f.w : f.d }, (_, i) =>
    ship.facing === "n"
      ? { x: f.x + i, z: f.z + f.d }
      : ship.facing === "s"
        ? { x: f.x + i, z: f.z - 1 }
        : ship.facing === "w"
          ? { x: f.x + f.w, z: f.z + i }
          : { x: f.x - 1, z: f.z + i },
  );
}

/** Chebyshev columns from the ramp's foot to the point's square. */
function gapOf(ship: DrawnDropship, square: Rect): number {
  return Math.min(
    ...rampFoot(ship).map((c) =>
      Math.max(
        Math.max(square.x - c.x, c.x - (square.x + square.w - 1), 0),
        Math.max(square.z - c.z, c.z - (square.z + square.d - 1), 0),
      ),
    ),
  );
}

/** Every column under the hull, with its highest tile. */
function hullColumns(
  map: TacticalMap,
  ship: DrawnDropship,
): { x: number; z: number; top: number }[] {
  const index = new TileIndex(map);
  const columns: { x: number; z: number; top: number }[] = [];
  const f = ship.footprint;
  for (let z = f.z; z < f.z + f.d; z++) {
    for (let x = f.x; x < f.x + f.w; x++) {
      const column = index.column(x, z);
      const tile = column[column.length - 1];
      columns.push({
        x,
        z,
        top:
          tile === undefined
            ? Infinity
            : tile.y +
              Math.max(
                tile.slope === undefined ? 0 : 1,
                tile.propId === undefined
                  ? 0
                  : (tile.sightHeight ?? STOREY_LAYERS),
              ),
      });
    }
  }
  return columns;
}

/** The one ship resolved for `map`; fails with none or several. */
function shipOf(map: TacticalMap): DrawnDropship {
  const ships = resolveForwardDropships(map);
  expect(ships).toHaveLength(1);
  return ships[0]!;
}

/** A Great Hive assault offer on `seed`, as the campaign makes it. */
function greatHive(seed: string): Mission {
  return {
    id: "mission-1",
    typeId: "hive-assault",
    cityId: "city-1",
    difficulty: 8,
    mapParams: { biome: "alpine", settlement: "city", size: "large", seed },
    hive: {
      hiveId: "greathive-1",
      regionId: "latin-america",
      level: 0,
      great: true,
    },
    rewards: { credits: 1800, techPoints: 170 },
    createdDay: 200,
    expiresDay: 207,
    ignorePenalty: 0,
    pinned: true,
  };
}

/** The Great Hive map on `seed`, as the game generates it. */
function greatHiveMap(seed: string): TacticalMap {
  const recipe = missionToMapRecipe(greatHive(seed), HIVE_ASSAULT);
  if (!recipe.ok) throw new Error(JSON.stringify(recipe.error));
  const registries = createDefaultRegistries();
  const result = new PipelineMapGenerator(
    createGreatHiveCavernPasses(),
    registries,
  ).run(recipe.value.params, new Mulberry32Rng(hashSeed(recipe.value.seed)));
  return freezeDraft(result.draft, recipe.value, registries);
}

/** The map's one forward point. */
function forwardOf(map: TacticalMap): Hook {
  const hook = map.hooks.objectives.find(
    (candidate) => candidate.kind === HookKinds.FORWARD_EXTRACTION,
  );
  expect(hook).toBeDefined();
  return hook!;
}

/** The square a hook's tiles fill. */
function squareOf(hook: Hook): Rect {
  const xs = hook.tiles.map((tile) => tile.x);
  const zs = hook.tiles.map((tile) => tile.z);
  const x = Math.min(...xs);
  const z = Math.min(...zs);
  return { x, z, w: Math.max(...xs) - x + 1, d: Math.max(...zs) - z + 1 };
}

// ===========================================
// Tests
// ===========================================

describe("resolveForwardDropships", () => {
  it("draws no ship on a map with no forward point", () => {
    const map = new FixtureMapBuilder(30, 30, 10)
      .fillGround(FLOOR)
      .deploy([{ x: 1, y: FLOOR, z: 1 }])
      .build();
    expect(resolveForwardDropships(map)).toEqual([]);
  });

  it("lands beside the point on open floor, its ramp on the point (#1179)", () => {
    const ship = shipOf(fixture());
    expect(ship.lift).toBe(0);
    expect(ship.level).toBe(FLOOR);
    expect(gapOf(ship, POINT)).toBe(0);
    expect([ship.footprint.w * ship.footprint.d]).toEqual([35]);
    for (const tile of pointTiles()) {
      expect(rectContains(ship.footprint, tile.x, tile.z)).toBe(false);
    }
    // Open floor leaves every facing equal, so the first in DIRECTIONS wins.
    expect(ship.facing).toBe("n");
  });

  it("shares the point's vision: its first tile, and every point and hull tile", () => {
    const map = fixture();
    const ship = shipOf(map);
    expect(ship.tile).toEqual(pointTiles()[0]);
    const keys = new Set(
      (ship.occupiedTiles ?? []).map((t) => `${t.x},${t.y},${t.z}`),
    );
    for (const tile of pointTiles()) {
      expect(keys.has(`${tile.x},${tile.y},${tile.z}`)).toBe(true);
    }
    for (const { x, z } of hullColumns(map, ship)) {
      expect(keys.has(`${x},${FLOOR},${z}`)).toBe(true);
    }
    expect(keys.size).toBe(16 + 35);
  });

  it("never sits in rock: it turns to the side the floor opens onto", () => {
    // Floor only south of the point's north edge; rock four layers up
    // north of it, where a north-facing hull would go.
    const map = fixture((b) => rockOutside(b, (_, z) => z >= POINT.z, 6));
    const ship = shipOf(map);
    expect(ship.lift).toBe(0);
    expect(ship.facing).not.toBe("n");
    for (const column of hullColumns(map, ship)) {
      expect(column.top).toBeLessThanOrEqual(FLOOR + ship.lift);
    }
  });

  it("holds a layer clear of a step when the passage is too narrow to land", () => {
    // A passage exactly the point's width, one layer below its banks.
    const map = fixture((b) =>
      rockOutside(b, (x) => x >= POINT.x && x < POINT.x + POINT.w, FLOOR + 1),
    );
    const ship = shipOf(map);
    expect(ship.lift).toBe(1);
    expect(gapOf(ship, POINT)).toBe(0);
    for (const column of hullColumns(map, ship)) {
      expect(column.top).toBeLessThanOrEqual(FLOOR + ship.lift);
    }
  });

  it("draws no ship where every berth is walled in rock", () => {
    const map = fixture((b) =>
      rockOutside(b, (x) => x >= POINT.x && x < POINT.x + POINT.w, 6),
    );
    expect(resolveForwardDropships(map)).toEqual([]);
  });

  it("keeps the hull off a nest where it would otherwise land", () => {
    const open = shipOf(fixture());
    const f = open.footprint;
    const nest = {
      x: f.x + Math.floor(f.w / 2),
      y: FLOOR,
      z: f.z + Math.floor(f.d / 2),
    };
    const ship = shipOf(
      fixture((b) => b.objective(HookKinds.EGG_SPAWNER, [nest])),
    );
    expect(rectContains(open.footprint, nest.x, nest.z)).toBe(true);
    expect(rectContains(ship.footprint, nest.x, nest.z)).toBe(false);
    expect(ship.lift).toBe(0);
  });

  it("holds a storey clear of props it cannot avoid, its ramp on bare floor", () => {
    // A boulder (a storey tall) every third column each way: no hull
    // five columns wide misses one.
    const boulders: TileCoord[] = [];
    for (let z = 0; z < 30; z += 3) {
      for (let x = 0; x < 30; x += 3) {
        if (!rectContains(POINT, x, z)) boulders.push({ x, y: FLOOR, z });
      }
    }
    const map = fixture((b) => {
      for (const tile of boulders) b.prop(PropKindIds.BOULDER, tile);
      return b;
    });
    const ship = shipOf(map);
    expect(ship.lift).toBe(STOREY_LAYERS);
    expect(gapOf(ship, POINT)).toBe(0);
    const columns = hullColumns(map, ship);
    expect(columns.some((c) => c.top === FLOOR + STOREY_LAYERS)).toBe(true);
    for (const column of columns) {
      expect(column.top).toBeLessThanOrEqual(FLOOR + ship.lift);
    }
    const props = new Set(boulders.map((t) => `${t.x},${t.z}`));
    for (const column of rampFoot(ship)) {
      expect(props.has(`${column.x},${column.z}`)).toBe(false);
    }
  });

  it("draws no ship whose ramp would come down on a prop", () => {
    // A corridor one column wider than the point, boulders on all of it
    // but the point: a hull may hold over them, but every ramp's foot
    // takes in the boulders beside the point.
    const corridor = (x: number): boolean =>
      x >= POINT.x && x <= POINT.x + POINT.w;
    const map = fixture((b) => {
      rockOutside(b, corridor, 6);
      for (let z = 0; z < 30; z++) {
        for (let x = POINT.x; x <= POINT.x + POINT.w; x++) {
          if (!rectContains(POINT, x, z)) {
            b.prop(PropKindIds.BOULDER, { x, y: FLOOR, z });
          }
        }
      }
      return b;
    });
    expect(resolveForwardDropships(map)).toEqual([]);
  });

  it(
    "berths on real Great Hives, never in rock, over a hook or on the point, including a narrow passage",
    () => {
      // gh-2 lands; gh-38's point sits in a five-column passage and the
      // ship holds a layer up on its bank; gh-12's chamber is the
      // smallest (radius 7) and the ship clears its clutter by a storey.
      const lifts: number[] = [];
      for (const seed of ["gh-2", "gh-38", "gh-12"]) {
        const map = greatHiveMap(seed);
        const hook = forwardOf(map);
        const square = squareOf(hook);
        const ship = shipOf(map);
        lifts.push(ship.lift);
        expect(ship.level).toBe(hook.tiles[0]!.y);
        expect(ship.lift).toBeLessThanOrEqual(FORWARD_DROPSHIP_MAX_LIFT);
        expect(gapOf(ship, square)).toBeLessThanOrEqual(FORWARD_DROPSHIP_GAP);
        const hooked = new Set(
          allHooks(map.hooks).flatMap((h) =>
            h.tiles.map((t) => `${t.x},${t.z}`),
          ),
        );
        for (const column of hullColumns(map, ship)) {
          expect(column.top).toBeLessThanOrEqual(ship.level + ship.lift);
          expect(hooked.has(`${column.x},${column.z}`)).toBe(false);
        }
      }
      expect(lifts).toEqual([0, 1, 2]);
    },
    GENERATION_TIMEOUT_MS,
  );
});
