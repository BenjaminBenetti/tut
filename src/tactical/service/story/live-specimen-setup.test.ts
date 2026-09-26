import { describe, expect, it } from "vitest";

import { BUG_SPECIES, LURKER } from "../../../bugs/data/species";
import { manhattanDistance } from "../../../core/service/grid-math";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { hatchTiles, snapshotMap } from "../../../mapgen/service/hatch-space";
import type { Mission } from "../../../overworld/model/mission";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { BugUnitSource } from "../../model/bug-unit-source";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type { TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { INFESTATION_CLEARANCE_SETUP } from "../missions/infestation-clearance-setup";
import { decidingObjectives } from "../objectives/objective-status";
import { missionWith, unitAt } from "../tactical-fixtures.test-helper";
import {
  LIVE_SPECIMEN_FALLBACK_DISTANCE,
  LIVE_SPECIMEN_PLACED_LURKERS,
  LIVE_SPECIMEN_SETUP,
  LIVE_SPECIMEN_SPECIES,
} from "./live-specimen-setup";
import { STORY_SETUP_RULES } from "./story-setup-rules";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The squad's landing: the 2×2 in the north-west corner. */
const DEPLOY = [at(0, 0), at(1, 0), at(0, 1), at(1, 1)];

/** The drop ship: the landing's northern row. */
const EXTRACTION = [at(0, 0), at(1, 0)];

/** Live Specimen's offer, as the director makes it. */
const SPECIMEN: Mission = {
  id: "mission-1",
  typeId: "infestation-clearance",
  storyId: "live-specimen",
  cityId: "city-1",
  difficulty: 3,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "small",
    seed: "live-specimen-setup",
  },
  rewards: { credits: 900, techPoints: 0 },
  createdDay: 1,
  expiresDay: 1,
  ignorePenalty: 10,
  pinned: true,
  act: "act-1",
};

/**
 * A 14×14 field, the squad landing in the north-west corner, with nests
 * at (12, 3) and (12, 12): the first is the nearer to the landing.
 * `wallAt` puts a solid wall down the east side of that column, so
 * everything east of it is out of the squad's reach.
 *
 * ```
 *   z=0   D D . . . . . . . . . . . .     D deploy (E the extraction row)
 *   z=3   . . . . . . . . . . . . N .     N nest
 *   z=12  . . . . . . . . . . . . N .
 * ```
 */
function field(wallAt?: number): TacticalMap {
  const builder = new FixtureMapBuilder(14, 14, 1)
    .fillGround()
    .deploy(DEPLOY)
    .extraction(EXTRACTION)
    .objective(HookKinds.EGG_SPAWNER, [at(12, 3)], PassMask.INFANTRY)
    .objective(HookKinds.EGG_SPAWNER, [at(12, 12)], PassMask.INFANTRY);
  if (wallAt !== undefined) {
    for (let z = 0; z < 14; z++) {
      builder.wall(at(wallAt, z), "e", "solid");
    }
  }
  return builder.build();
}

/** A mission on `map` with one squad on the landing and the drop ship's row. */
function missionOn(map: TacticalMap): TacticalState {
  return {
    ...missionWith(map, [unitAt("squad", "infantry", at(0, 0))], {
      difficulty: 3,
    }),
    extraction: EXTRACTION,
  };
}

/** Setup deps over fresh ids and the shipped tunings, without species. */
function bareDeps(): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
  };
}

/** Setup deps over fresh ids, the shipped tunings, and `species`. */
function deps(
  species: readonly BugUnitSource[] = Object.values(BUG_SPECIES),
): MissionSetupDeps {
  return { ...bareDeps(), species };
}

/** The clearance's setup and then Live Specimen's on `map`, one id stream. */
function setUp(map: TacticalMap, setupDeps = deps()) {
  const typed = INFESTATION_CLEARANCE_SETUP.setup(
    missionOn(map),
    map,
    SPECIMEN,
    setupDeps,
  );
  if (!typed.ok) throw new Error(typed.error.kind);
  return {
    typed: typed.value,
    story: LIVE_SPECIMEN_SETUP.setup(typed.value, map, SPECIMEN, setupDeps),
  };
}

/** The mission `setUp` returned, or a thrown error. */
function setUpOk(map: TacticalMap): TacticalState {
  const { story } = setUp(map);
  if (!story.ok) throw new Error(story.error.kind);
  return story.value;
}

/** The bugs `after` has that `before` did not. */
function placed(before: TacticalState, after: TacticalState): Unit[] {
  const had = new Set(before.units.map((unit) => unit.id));
  return after.units.filter((unit) => !had.has(unit.id));
}

/** Every tile infantry can walk to from the landing. */
function squadGround(map: TacticalMap): Set<string> {
  const tiles = hatchTiles(
    snapshotMap(map),
    DEPLOY[0]!,
    Number.POSITIVE_INFINITY,
    PassMask.INFANTRY,
  );
  return new Set(tiles.map((tile) => `${String(tile.x)},${String(tile.z)}`));
}

const keyOf = (tile: TileCoord): string =>
  `${String(tile.x)},${String(tile.z)}`;

// ===========================================
// The rule
// ===========================================

describe("LIVE_SPECIMEN_SETUP (campaign arc §6.9, #1179)", () => {
  it("is Live Specimen's entry in the shipped story table, and the only one", () => {
    expect(STORY_SETUP_RULES["live-specimen"]).toBe(LIVE_SPECIMEN_SETUP);
    expect(LIVE_SPECIMEN_SETUP.storyId).toBe("live-specimen");
    // First Skyfall is its crash site's setup alone.
    expect(Object.keys(STORY_SETUP_RULES)).toEqual(["live-specimen"]);
    expect(LIVE_SPECIMEN_SPECIES).toBe("lurker");
    expect(LIVE_SPECIMEN_PLACED_LURKERS).toBe(2);
  });

  it("keeps the nests as optional objectives and makes the capture of a lurker the one that decides", () => {
    const mission = setUpOk(field());
    expect(mission.objectives).toEqual([
      {
        id: "objective-1",
        kind: "destroy-spawner",
        targetId: "spawner-1",
        complete: false,
        optional: true,
      },
      {
        id: "objective-2",
        kind: "destroy-spawner",
        targetId: "spawner-2",
        complete: false,
        optional: true,
      },
      {
        id: "objective-3",
        kind: "capture-specimen",
        species: "lurker",
        complete: false,
        failed: false,
      },
    ]);
    expect(decidingObjectives(mission.objectives).map((o) => o.kind)).toEqual([
      "capture-specimen",
    ]);
    // The nests themselves are untouched.
    expect(mission.spawners.map((spawner) => spawner.pos)).toEqual([
      at(12, 3),
      at(12, 12),
    ]);
  });

  it("stands a lurker by each nest, nearest the landing first, on ground the squad can walk to", () => {
    const { typed, story } = setUp(field());
    if (!story.ok) throw new Error(story.error.kind);
    const lurkers = placed(typed, story.value);
    expect(lurkers).toHaveLength(LIVE_SPECIMEN_PLACED_LURKERS);
    expect(lurkers.map((unit) => unit.sourceId)).toEqual(["lurker", "lurker"]);
    expect(lurkers.map((unit) => unit.id)).toEqual(["unit-1", "unit-2"]);
    expect(lurkers.map((unit) => unit.hp)).toEqual([LURKER.hp, LURKER.hp]);
    const nests = typed.spawners;
    lurkers.forEach((lurker, den) => {
      const nest = nests[den];
      if (nest === undefined) throw new Error("fixture has two nests");
      expect(manhattanDistance(lurker.pos, nest.pos)).toBeLessThanOrEqual(
        nest.hatchRadius,
      );
    });
    expect(story.value.templates["bug:lurker"]?.maxHp).toBe(LURKER.hp);
  });

  it("wraps to the nearest nest again when there is only one", () => {
    const map = new FixtureMapBuilder(14, 14, 1)
      .fillGround()
      .deploy(DEPLOY)
      .extraction(EXTRACTION)
      .objective(HookKinds.EGG_SPAWNER, [at(10, 10)], PassMask.INFANTRY)
      .build();
    const { typed, story } = setUp(map);
    if (!story.ok) throw new Error(story.error.kind);
    const lurkers = placed(typed, story.value);
    expect(lurkers).toHaveLength(2);
    for (const lurker of lurkers) {
      expect(manhattanDistance(lurker.pos, at(10, 10))).toBeLessThanOrEqual(
        typed.spawners[0]?.hatchRadius ?? 0,
      );
    }
  });

  it("never stands one on the landing or the drop ship, even when a nest opens onto them", () => {
    // A landing six columns wide, and a nest at (6, 7) walled on its
    // north, east and south: its hatchlings step out west, onto the
    // landing, first.
    const landing = Array.from({ length: 6 * 14 }, (_, i) =>
      at(i % 6, Math.floor(i / 6)),
    );
    const nest = at(6, 7);
    const map = new FixtureMapBuilder(14, 14, 1)
      .fillGround()
      .deploy(landing)
      .extraction(EXTRACTION)
      .objective(HookKinds.EGG_SPAWNER, [nest], PassMask.INFANTRY)
      .wall(nest, "n", "solid")
      .wall(nest, "e", "solid")
      .wall(nest, "s", "solid")
      .build();
    const { typed, story } = setUp(map);
    if (!story.ok) throw new Error(story.error.kind);
    const lurkers = placed(typed, story.value);
    expect(lurkers).toHaveLength(2);
    const banned = new Set([...landing, ...EXTRACTION].map(keyOf));
    for (const lurker of lurkers) {
      expect(banned.has(keyOf(lurker.pos))).toBe(false);
      expect(manhattanDistance(lurker.pos, nest)).toBeLessThanOrEqual(
        typed.spawners[0]?.hatchRadius ?? 0,
      );
    }
  });

  it("falls back to reachable ground a turn's walk from the landing when every nest is walled off", () => {
    // The wall down x = 7 keeps both nests (x = 12) out of reach.
    const map = field(7);
    const { typed, story } = setUp(map);
    if (!story.ok) throw new Error(story.error.kind);
    const lurkers = placed(typed, story.value);
    expect(lurkers).toHaveLength(1);
    const lurker = lurkers[0];
    if (lurker === undefined) throw new Error("one lurker must stand");
    expect(lurker.pos.x).toBeLessThanOrEqual(7);
    expect(squadGround(map).has(keyOf(lurker.pos))).toBe(true);
    for (const tile of DEPLOY) {
      expect(manhattanDistance(lurker.pos, tile)).toBeGreaterThanOrEqual(
        LIVE_SPECIMEN_FALLBACK_DISTANCE,
      );
    }
  });

  it("falls back to reachable ground when the map has no nest at all", () => {
    const map = new FixtureMapBuilder(14, 14, 1)
      .fillGround()
      .deploy(DEPLOY)
      .extraction(EXTRACTION)
      .build();
    const mission = LIVE_SPECIMEN_SETUP.setup(
      missionOn(map),
      map,
      SPECIMEN,
      deps(),
    );
    if (!mission.ok) throw new Error(mission.error.kind);
    expect(
      mission.value.units.filter((unit) => unit.sourceId === "lurker"),
    ).toHaveLength(1);
  });

  it("stands one anywhere off the landing when nothing is a turn's walk away", () => {
    // A 4×4 field: no tile is 8 from the landing, so the last resort.
    const map = new FixtureMapBuilder(4, 4, 1)
      .fillGround()
      .deploy(DEPLOY)
      .extraction(EXTRACTION)
      .build();
    const mission = LIVE_SPECIMEN_SETUP.setup(
      missionOn(map),
      map,
      SPECIMEN,
      deps(),
    );
    if (!mission.ok) throw new Error(mission.error.kind);
    const lurkers = mission.value.units.filter(
      (unit) => unit.sourceId === "lurker",
    );
    expect(lurkers).toHaveLength(1);
    expect(DEPLOY.map(keyOf)).not.toContain(keyOf(lurkers[0]?.pos ?? at(0, 0)));
  });

  it("refuses a map where nothing the squad can reach has room for one", () => {
    // The landing is the whole field.
    const map = new FixtureMapBuilder(2, 2, 1)
      .fillGround()
      .deploy(DEPLOY)
      .extraction(EXTRACTION)
      .build();
    const refused = LIVE_SPECIMEN_SETUP.setup(
      missionOn(map),
      map,
      SPECIMEN,
      deps(),
    );
    expect(refused).toEqual({
      ok: false,
      error: {
        kind: "map-recipe",
        reason: "no ground the squad can reach has room for the specimen",
      },
    });
  });

  it("refuses when the deps carry no lurker to place", () => {
    for (const setupDeps of [bareDeps(), deps([BUG_SPECIES.brute])]) {
      const { story } = setUp(field(), setupDeps);
      expect(story).toEqual({
        ok: false,
        error: { kind: "unknown-unit-type", unitKind: "bug", id: "lurker" },
      });
    }
  });

  it("is deterministic and never mutates the mission it is given", () => {
    const map = field();
    const typed = INFESTATION_CLEARANCE_SETUP.setup(
      missionOn(map),
      map,
      SPECIMEN,
      deps(),
    );
    if (!typed.ok) throw new Error(typed.error.kind);
    const frozen = JSON.stringify(typed.value);
    const a = LIVE_SPECIMEN_SETUP.setup(typed.value, map, SPECIMEN, deps());
    const b = LIVE_SPECIMEN_SETUP.setup(typed.value, map, SPECIMEN, deps());
    expect(a).toEqual(b);
    expect(JSON.stringify(typed.value)).toBe(frozen);
  });
});
