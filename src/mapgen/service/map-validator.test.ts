import { describe, expect, it } from "vitest";

import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { CoverLevel } from "../model/cover";
import { HookKinds } from "../model/hook";
import { PassMask } from "../model/pass-mask";
import type { TacticalMap } from "../model/tactical-map";
import type { TileCoord } from "../model/tile-coord";
import { createDefaultRegistries } from "./default-registries";
import { FixtureMapBuilder } from "./fixture-map-builder";
import type { InvariantId } from "./map-validator";
import { validateTacticalMap } from "./map-validator";

const registries = createDefaultRegistries();

const BUILDING_ID = "b1";
const FOOTPRINT = { x: 2, z: 1, w: 3, d: 2 };
const DOOR_TILE: TileCoord = { x: 3, y: 0, z: 2 };
const STAIR_FROM: TileCoord = { x: 2, y: 0, z: 1 };
const STAIR_TO: TileCoord = { x: 3, y: 1, z: 1 };
const HOLE: TileCoord = { x: 2, y: 1, z: 1 };
const OBJECTIVE: TileCoord = { x: 4, y: 1, z: 1 };
const CRATE: TileCoord = { x: 0, y: 0, z: 5 };
const OUTSIDE_DOOR: TileCoord = { x: 3, y: 0, z: 3 };

/** Deploy zone: the 3×3 block at x 5..7, z 3..5. */
function deployTiles(): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = 3; z <= 5; z++) {
    for (let x = 5; x <= 7; x++) {
      tiles.push({ x, y: 0, z });
    }
  }
  return tiles;
}

/**
 * 8×6, three levels. A two-storey house at x 2..4, z 1..2 with a south
 * door, stairs in its north-west corner, an egg spawner upstairs, a deploy
 * zone in the south-east, an edge spawn on the north edge, a crate.
 *
 * ```
 *   z0  S S " " " " " "
 *   z1  " " [ _ _ ] " "     [ ] = house, stairs at (2,1)
 *   z2  " " [ _ d _ ] " "   d = door on the south wall
 *   z3  " " " " " D D D
 *   z4  " " " " " D D D
 *   z5  o " " " " D D D
 * ```
 */
function validFixture(): FixtureMapBuilder {
  const b = new FixtureMapBuilder(8, 6, 3).fillGround();
  for (let z = 1; z <= 2; z++) {
    for (let x = 2; x <= 4; x++) {
      b.tile({ x, y: 0, z }, SurfaceIds.FLOOR, {
        buildingId: BUILDING_ID,
        floorIndex: 0,
      });
      if (x !== HOLE.x || z !== HOLE.z) {
        b.tile({ x, y: 1, z }, SurfaceIds.FLOOR, {
          buildingId: BUILDING_ID,
          floorIndex: 1,
        });
      }
    }
  }
  b.patchTile(STAIR_FROM, { surface: SurfaceIds.STAIRS });
  for (const y of [0, 1]) {
    for (let z = 1; z <= 2; z++) {
      for (let x = 2; x <= 4; x++) {
        if (y === HOLE.y && x === HOLE.x && z === HOLE.z) {
          continue;
        }
        const coord = { x, y, z };
        if (z === 1) b.wall(coord, "n", "solid");
        if (z === 2) b.wall(coord, "s", "solid");
        if (x === 2) b.wall(coord, "w", "solid");
        if (x === 4) b.wall(coord, "e", "solid");
      }
    }
  }
  b.wall(DOOR_TILE, "s", "door");
  const stairsId = b.connector("stairs", STAIR_FROM, STAIR_TO, BUILDING_ID);
  b.building({
    id: BUILDING_ID,
    kind: "house",
    footprint: [FOOTPRINT],
    groundLevel: 0,
    floors: [
      { index: 0, y: 0, rooms: [] },
      { index: 1, y: 1, rooms: [] },
    ],
    roof: { kind: "pitched", walkable: false },
    entrances: [{ tile: DOOR_TILE, side: "s" }],
    connectorIds: [stairsId],
  });
  b.prop(PropKindIds.CRATE, CRATE);
  b.deploy(deployTiles());
  b.edgeSpawn([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
  ]);
  b.objective(HookKinds.EGG_SPAWNER, [OBJECTIVE], PassMask.INFANTRY);
  b.requires([
    { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
    {
      kind: HookKinds.EGG_SPAWNER,
      count: 1,
      requiredPass: PassMask.INFANTRY,
      minDistanceFromDeploy: 2,
    },
    { kind: HookKinds.EDGE_SPAWN, count: 1, requiredPass: PassMask.INFANTRY },
    { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
  ]);
  return b;
}

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) {
    throw new Error("expected at least one item");
  }
  return item;
}

function invariantsOf(map: TacticalMap): InvariantId[] {
  return [
    ...new Set(validateTacticalMap(map, registries).map((v) => v.invariant)),
  ];
}

describe("validateTacticalMap", () => {
  it("accepts the reference fixture", () => {
    expect(validateTacticalMap(validFixture().build(), registries)).toEqual([]);
  });

  it("I1: rejects out-of-bounds and duplicate tiles and stops there", () => {
    const outside = validFixture()
      .tile({ x: 8, y: 0, z: 0 }, SurfaceIds.GRASS)
      .build();
    expect(invariantsOf(outside)).toEqual(["I1"]);

    const valid = validFixture().build();
    const first = valid.tiles[0];
    if (first === undefined) {
      throw new Error("fixture has no tiles");
    }
    const duplicate: TacticalMap = { ...valid, tiles: [...valid.tiles, first] };
    expect(invariantsOf(duplicate)).toEqual(["I1"]);
  });

  it("I2: rejects passable prop tiles, wrong cover and cover without a prop", () => {
    expect(
      invariantsOf(
        validFixture().patchTile(CRATE, { pass: PassMask.ALL }).build(),
      ),
    ).toContain("I2");
    expect(
      invariantsOf(
        validFixture()
          .patchTile(CRATE, { coverProvided: CoverLevel.HIGH })
          .build(),
      ),
    ).toContain("I2");
    expect(
      invariantsOf(
        validFixture()
          .patchTile({ x: 7, y: 0, z: 0 }, { coverProvided: CoverLevel.LOW })
          .build(),
      ),
    ).toContain("I2");
  });

  it("I2: rejects blocksLos that disagrees with the prop or appears without one", () => {
    // A crate does not block sight; a bare tile never does.
    expect(
      invariantsOf(
        validFixture().patchTile(CRATE, { blocksLos: true }).build(),
      ),
    ).toContain("I2");
    expect(
      invariantsOf(
        validFixture()
          .patchTile({ x: 7, y: 0, z: 0 }, { blocksLos: true })
          .build(),
      ),
    ).toContain("I2");
  });

  it("I3: rejects a wall that only one side knows about", () => {
    const map = validFixture()
      .wallOneSided({ x: 0, y: 0, z: 3 }, "e", "solid")
      .build();
    const violations = validateTacticalMap(map, registries);
    expect(violations.map((v) => v.invariant)).toEqual(["I3"]);
    expect(violations).toHaveLength(1);
  });

  it("I4: rejects connectors with the wrong rise, pass or start surface", () => {
    const flat = validFixture();
    flat.connector("ramp", { x: 5, y: 0, z: 0 }, { x: 6, y: 0, z: 0 });
    expect(invariantsOf(flat.build())).toContain("I4");

    const wrongPass = validFixture().build();
    const stairs = wrongPass.connectors[0];
    if (stairs === undefined) {
      throw new Error("fixture has no stairs");
    }
    const tampered: TacticalMap = {
      ...wrongPass,
      connectors: [{ ...stairs, pass: PassMask.ALL }],
    };
    expect(invariantsOf(tampered)).toContain("I4");

    const noStairSurface = validFixture()
      .patchTile(STAIR_FROM, { surface: SurfaceIds.FLOOR })
      .build();
    expect(invariantsOf(noStairSurface)).toContain("I4");
  });

  it("I5: rejects a missing door, an unreachable floor and a mech-passable interior", () => {
    expect(
      invariantsOf(validFixture().wall(DOOR_TILE, "s", "solid").build()),
    ).toContain("I5");

    const noStairs = validFixture().build();
    const cut: TacticalMap = { ...noStairs, connectors: [] };
    expect(invariantsOf(cut)).toContain("I5");

    expect(
      invariantsOf(
        validFixture().patchTile(OBJECTIVE, { pass: PassMask.ALL }).build(),
      ),
    ).toContain("I5");
  });

  it("I6: rejects thin deploy zones, inland edge spawns and hooks on bad tiles", () => {
    const thin = validFixture();
    const map = thin.build();
    const smallDeploy: TacticalMap = {
      ...map,
      hooks: {
        ...map.hooks,
        deployZones: [
          { ...first(map.hooks.deployZones), tiles: deployTiles().slice(0, 3) },
        ],
      },
    };
    expect(invariantsOf(smallDeploy)).toContain("I6");

    const inland: TacticalMap = {
      ...map,
      hooks: {
        ...map.hooks,
        edgeSpawns: [
          { ...first(map.hooks.edgeSpawns), tiles: [{ x: 1, y: 0, z: 4 }] },
        ],
      },
    };
    expect(invariantsOf(inland)).toContain("I6");

    const onProp = validFixture()
      .objective(HookKinds.EGG_SPAWNER, [CRATE], PassMask.INFANTRY)
      .build();
    expect(invariantsOf(onProp)).toContain("I6");

    const missing = validFixture()
      .objective(
        HookKinds.EGG_SPAWNER,
        [{ x: 7, y: 2, z: 5 }],
        PassMask.INFANTRY,
      )
      .build();
    expect(invariantsOf(missing)).toContain("I6");
  });

  it("I7: rejects an objective the required class cannot reach", () => {
    const blocked = validFixture()
      .prop(PropKindIds.BOULDER, OUTSIDE_DOOR)
      .build();
    const violations = validateTacticalMap(blocked, registries);
    expect(violations.map((v) => v.invariant)).toEqual(["I7"]);
    expect(violations[0]?.message).toContain("egg-spawner");
  });

  it("I8: rejects hook counts and distances that miss the recipe", () => {
    const tooFew = validFixture()
      .requires([
        {
          kind: HookKinds.EGG_SPAWNER,
          count: 2,
          requiredPass: PassMask.INFANTRY,
        },
      ])
      .build();
    expect(invariantsOf(tooFew)).toEqual(["I8"]);

    const tooClose = validFixture()
      .requires([
        {
          kind: HookKinds.EGG_SPAWNER,
          count: 1,
          requiredPass: PassMask.INFANTRY,
          minDistanceFromDeploy: 10,
        },
      ])
      .build();
    expect(invariantsOf(tooClose)).toEqual(["I8"]);
  });

  it("reports every broken invariant in one run", () => {
    const map = validFixture()
      .wallOneSided({ x: 0, y: 0, z: 3 }, "e", "solid")
      .prop(PropKindIds.BOULDER, OUTSIDE_DOOR)
      .requires([
        {
          kind: HookKinds.EGG_SPAWNER,
          count: 3,
          requiredPass: PassMask.INFANTRY,
        },
      ])
      .build();
    expect(invariantsOf(map).sort()).toEqual(["I3", "I7", "I8"]);
  });
});
