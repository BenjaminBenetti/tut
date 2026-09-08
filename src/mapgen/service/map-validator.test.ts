import { STOREY_LAYERS } from "../../core/model/elevation";
import { describe, expect, it } from "vitest";

import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { CoverLevel } from "../model/cover";
import type { Building } from "../model/building";
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
const STAIR_TO: TileCoord = { x: 3, y: STOREY_LAYERS, z: 1 };
const HOLE: TileCoord = { x: 2, y: STOREY_LAYERS, z: 1 };
const OBJECTIVE: TileCoord = { x: 4, y: STOREY_LAYERS, z: 1 };
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
  const b = new FixtureMapBuilder(8, 6, 3 * STOREY_LAYERS).fillGround();
  for (let z = 1; z <= 2; z++) {
    for (let x = 2; x <= 4; x++) {
      b.tile({ x, y: 0, z }, SurfaceIds.FLOOR, {
        buildingId: BUILDING_ID,
        floorIndex: 0,
      });
      if (x !== HOLE.x || z !== HOLE.z) {
        b.tile({ x, y: STOREY_LAYERS, z }, SurfaceIds.FLOOR, {
          buildingId: BUILDING_ID,
          floorIndex: 1,
        });
      }
    }
  }
  b.patchTile(STAIR_FROM, { surface: SurfaceIds.STAIRS });
  for (const y of [0, STOREY_LAYERS]) {
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
      { index: 1, y: STOREY_LAYERS, rooms: [] },
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
        [{ x: 7, y: 2 * STOREY_LAYERS, z: 5 }],
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

// ===========================================
// Checks no fixture had ever reached (#735)
// ===========================================

/**
 * Every violation as `"<invariant> <message>"`. The existing suite asserts
 * de-duplicated invariant ids, which one representative failure per
 * invariant satisfies — that is why 25 of these checks had never run. A
 * guard is only proven by the text it reports, so these name it.
 */
function reportOf(map: TacticalMap): string[] {
  return validateTacticalMap(map, registries).map(
    (v) => `${v.invariant} ${v.message}`,
  );
}

/** The reference map, for tests that reshape it rather than rebuild it. */
function valid(): TacticalMap {
  return validFixture().build();
}

/** The fixture's only building record. */
function theBuilding(map: TacticalMap): Building {
  return first(map.buildings);
}

/** The reference map with its building replaced by a broken one. */
function withBuilding(change: Partial<Building>): TacticalMap {
  const map = valid();
  return { ...map, buildings: [{ ...theBuilding(map), ...change }] };
}

describe("validateTacticalMap: checks that no fixture reached (#735)", () => {
  it("I1: reports non-positive map dimensions", () => {
    const map: TacticalMap = { ...valid(), width: 0 };
    expect(reportOf(map)).toContain(
      `I1 Map dimensions must be positive: 0\u00d76\u00d7${String(3 * STOREY_LAYERS)}`,
    );
  });

  it("I2: reports a duplicate prop id", () => {
    const map = valid();
    const prop = first(map.props);
    expect(reportOf({ ...map, props: [...map.props, { ...prop }] })).toContain(
      "I2 Duplicate prop id",
    );
  });

  it("I2: reports a prop standing on a tile that is not there", () => {
    const map = validFixture().removeTile(CRATE).build();
    expect(reportOf(map)).toContain(
      `I2 Prop ${first(map.props).id} sits on a missing tile`,
    );
  });

  it("I2: reports a prop whose tile does not point back at it", () => {
    const map = valid();
    const prop = first(map.props);
    const moved: TacticalMap = {
      ...map,
      props: [{ ...prop, tile: { x: 7, y: 0, z: 0 } }],
    };
    expect(reportOf(moved)).toContain(
      `I2 Prop ${prop.id}'s tile does not point back at it`,
    );
  });

  it("I2: reports a tile still holding a prop that has moved away", () => {
    const map = valid();
    const prop = first(map.props);
    const moved: TacticalMap = {
      ...map,
      props: [{ ...prop, tile: { x: 7, y: 0, z: 0 } }],
    };
    expect(reportOf(moved)).toContain(
      `I2 Prop ${prop.id} is recorded on a different tile`,
    );
  });

  it("I2: reports a tile pointing at a prop that does not exist", () => {
    const map = validFixture()
      .patchTile({ x: 7, y: 0, z: 0 }, { propId: "ghost" })
      .build();
    expect(reportOf(map)).toContain("I2 Tile references unknown prop ghost");
  });

  it("I2: reports a prop kind the registry does not know", () => {
    const map = valid();
    const prop = first(map.props);
    const unknown: TacticalMap = {
      ...map,
      props: [{ ...prop, kind: "granite-obelisk" }],
    };
    expect(reportOf(unknown)).toContain(
      'I2 Unknown prop kind "granite-obelisk"',
    );
  });

  it("I4: reports a duplicate connector id", () => {
    const map = valid();
    const connector = first(map.connectors);
    expect(
      reportOf({ ...map, connectors: [...map.connectors, { ...connector }] }),
    ).toContain(`I4 Duplicate connector id ${connector.id}`);
  });

  it("I4: reports a connector reaching a tile that is not there", () => {
    const map = validFixture().removeTile(STAIR_TO).build();
    expect(reportOf(map)).toContain(
      `I4 Connector ${first(map.connectors).id} references a missing tile`,
    );
  });

  it("I4: reports connector endpoints that are not adjacent", () => {
    const map = valid();
    const connector = first(map.connectors);
    const stretched: TacticalMap = {
      ...map,
      connectors: [{ ...connector, to: { x: 4, y: STOREY_LAYERS, z: 1 } }],
    };
    expect(reportOf(stretched)).toContain(
      `I4 Connector ${connector.id} endpoints are not adjacent`,
    );
  });

  it("I4: reports a connector naming a building that does not exist", () => {
    const map = valid();
    const connector = first(map.connectors);
    const orphaned: TacticalMap = {
      ...map,
      connectors: [{ ...connector, buildingId: "ghost" }],
    };
    expect(reportOf(orphaned)).toContain(
      `I4 Connector ${connector.id} names unknown building ghost`,
    );
  });

  it("I5: reports a duplicate building id", () => {
    const map = valid();
    expect(
      reportOf({
        ...map,
        buildings: [...map.buildings, { ...theBuilding(map) }],
      }),
    ).toContain(`I5 Duplicate building id ${BUILDING_ID}`);
  });

  it("I5: reports a building with no floors", () => {
    expect(reportOf(withBuilding({ floors: [] }))).toContain(
      `I5 Building ${BUILDING_ID} has no floors`,
    );
  });

  it("I5: reports a building with no footprint", () => {
    expect(reportOf(withBuilding({ footprint: [] }))).toContain(
      `I5 Building ${BUILDING_ID} has no footprint`,
    );
  });

  it("I5: reports a floor at the wrong level", () => {
    const map = valid();
    const building = theBuilding(map);
    const upper = building.floors[1];
    if (upper === undefined) {
      throw new Error("fixture building has no upper floor");
    }
    expect(
      reportOf(
        withBuilding({ floors: [first(building.floors), { ...upper, y: 99 }] }),
      ),
    ).toContain(
      `I5 Building ${BUILDING_ID} floor 1 is mis-numbered or at the wrong level`,
    );
  });

  it("I5: reports a building with no entrance", () => {
    expect(reportOf(withBuilding({ entrances: [] }))).toContain(
      `I5 Building ${BUILDING_ID} has no entrance`,
    );
  });

  it("I5: reports an entrance that is not on one of the building's tiles", () => {
    expect(
      reportOf(
        withBuilding({
          entrances: [{ tile: { x: 7, y: 0, z: 0 }, side: "s" }],
        }),
      ),
    ).toContain(
      `I5 Building ${BUILDING_ID} entrance is not on one of its tiles`,
    );
  });

  it("I5: reports an entrance above the ground floor", () => {
    expect(
      reportOf(
        withBuilding({
          entrances: [{ tile: { x: 3, y: STOREY_LAYERS, z: 2 }, side: "s" }],
        }),
      ),
    ).toContain(
      `I5 Building ${BUILDING_ID} entrance is not on the ground floor`,
    );
  });

  it("I5: reports a building tile outside the footprint", () => {
    const map = validFixture()
      .patchTile(
        { x: 7, y: 0, z: 0 },
        { buildingId: BUILDING_ID, floorIndex: 0 },
      )
      .build();
    expect(reportOf(map)).toContain(
      `I5 Building ${BUILDING_ID} tile lies outside its footprint`,
    );
  });

  it("I5: reports a roof tile on a building whose roof is not walkable", () => {
    const map = validFixture()
      .patchTile({ x: 2, y: 0, z: 1 }, { surface: SurfaceIds.ROOF })
      .build();
    expect(reportOf(map)).toContain(
      `I5 Building ${BUILDING_ID} has a roof tile it should not have`,
    );
  });

  it("I5: reports a floorIndex that disagrees with the tile's level", () => {
    const map = validFixture()
      .patchTile({ x: 2, y: 0, z: 1 }, { floorIndex: 1 })
      .build();
    expect(reportOf(map)).toContain(
      `I5 Building ${BUILDING_ID} tile has a floorIndex inconsistent with its level`,
    );
  });

  it("I5: reports a declared floor with no tiles on it", () => {
    const map = valid();
    const building = theBuilding(map);
    expect(
      reportOf(
        withBuilding({
          floors: [
            ...building.floors,
            { index: 2, y: 2 * STOREY_LAYERS, rooms: [] },
          ],
        }),
      ),
    ).toContain(`I5 Building ${BUILDING_ID} floor 2 has no tiles`);
  });

  it("I5: reports a walkable roof with no roof tiles", () => {
    expect(
      reportOf(withBuilding({ roof: { kind: "pitched", walkable: true } })),
    ).toContain(
      `I5 Building ${BUILDING_ID} claims a walkable roof but has no roof tiles`,
    );
  });

  it("I6: reports a duplicate hook id", () => {
    const map = valid();
    const zone = first(map.hooks.deployZones);
    expect(
      reportOf({
        ...map,
        hooks: { ...map.hooks, deployZones: [zone, { ...zone }] },
      }),
    ).toContain(`I6 Duplicate hook id ${zone.id}`);
  });

  it("I6: reports a deploy zone split into unreachable parts", () => {
    // (7,0,0) is the north-east corner, so walling south and west seals
    // it off entirely: passable, and reachable from nowhere.
    const built = validFixture()
      .wall({ x: 7, y: 0, z: 0 }, "s", "solid")
      .wall({ x: 7, y: 0, z: 0 }, "w", "solid")
      .build();
    const zone = first(built.hooks.deployZones);
    const split: TacticalMap = {
      ...built,
      hooks: {
        ...built.hooks,
        deployZones: [
          { ...zone, tiles: [...zone.tiles, { x: 7, y: 0, z: 0 }] },
        ],
      },
    };
    const report = reportOf(split);
    expect(report).toContain(
      `I6 Deploy zone ${zone.id} is not connected for class ${String(PassMask.INFANTRY)}`,
    );
    expect(report).toContain(
      `I6 Deploy zone ${zone.id} is not connected for class ${String(PassMask.MECH)}`,
    );
  });
});
