import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../../bugs/data/species";
import { HIVE_ASSAULT } from "../../../content/data/mission-types";
import { STOREY_LAYERS } from "../../../core/model/elevation";
import { chebyshevDistance } from "../../../core/service/grid-math";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { allHooks, HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { generateTacticalMap } from "../../../mapgen/service/generate-tactical-map";
import { missionToMapRecipe } from "../../../mapgen/service/mission-map-recipe-adapter";
import type { Mission } from "../../../overworld/model/mission";
import { BROOD_TUNING } from "../../data/brood-tuning";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type { TacticalState } from "../../model/tactical-state";
import { DEFAULT_HATCH_RADIUS } from "../../model/tactical-state";
import { isDormant } from "../../model/unit";
import { placeCavernBroods } from "../brood-placement-service";
import { spawnerFootprintTiles } from "../footprint-service";
import { missionWith, unitAt } from "../tactical-fixtures.test-helper";
import { templateIdFor } from "../unit-factory";
import {
  createHiveAssaultSetup,
  HIVE_ASSAULT_SETUP,
  hiveCoreHp,
  hiveGuardCount,
  hiveGuardPositions,
  NO_BROODS,
  setUpHiveAssault,
} from "./hive-assault-setup";
import { MISSION_SETUP_RULES } from "./mission-setup-rules";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The Hive Guard's template id, as `placeHiveGuards` stamps it. */
const GUARD_TEMPLATE = templateIdFor("bug", "hive-guard");

/** The 3×3 core pad on the 14×14 field: x 6–8, z 6–8, lowest corner first. */
const PAD: readonly TileCoord[] = [6, 7, 8].flatMap((z) =>
  [6, 7, 8].map((x) => at(x, z)),
);

/**
 * An open 14×14 floor with the drop ship at the corner, the core pad in
 * the middle and two nests.
 *
 * ```
 *   z=12  . E . . . . . . . . . . .      D  deploy (0, 0)
 *          ...                           C  core pad x 6–8, z 6–8
 *   z=6   . . . . . . C C C . . . .      E  nest hooks (1, 12), (12, 1)
 *          ...
 *   z=0   D . . . . . . . . . . . .
 * ```
 */
function cavernFloor(extraNest?: TileCoord): TacticalMap {
  const builder = new FixtureMapBuilder(14, 14, 3 * STOREY_LAYERS)
    .fillGround()
    .deploy([at(0, 0)])
    .objective(HookKinds.HIVE_CORE, PAD, PassMask.ALL, {
      chamberId: "chamber-3",
      footprint: 3,
    })
    .objective(HookKinds.EGG_SPAWNER, [at(1, 12)])
    .objective(HookKinds.EGG_SPAWNER, [at(12, 1)]);
  return (
    extraNest === undefined
      ? builder
      : builder.objective(HookKinds.EGG_SPAWNER, [extraNest])
  ).build();
}

/** A Hive Assault offer against a hive of `level`. */
function offer(
  level: number | undefined,
): Pick<Mission, "difficulty" | "hive"> {
  return {
    difficulty: 4,
    ...(level === undefined
      ? {}
      : { hive: { hiveId: "hive-1", regionId: "east", level } }),
  };
}

/** Setup deps over fresh ids and the shipped tunings and guard. */
function deps(): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
  };
}

/** The mission a squad lands in on `map`, before the setup rule. */
function landed(map: TacticalMap): TacticalState {
  return missionWith(map, [unitAt("squad", "infantry", at(0, 0))]);
}

/** Runs the shipped setup on `map` for a hive of `level`; throws on a refusal. */
function setUp(map: TacticalMap, level: number | undefined): TacticalState {
  const placed = setUpHiveAssault(landed(map), map, offer(level), deps());
  if (!placed.ok) {
    throw new Error(`setup refused: ${JSON.stringify(placed.error)}`);
  }
  return placed.value;
}

/** Positions of the Hive Guards standing in `state`. */
function guardsOf(state: TacticalState): TileCoord[] {
  return state.units
    .filter((unit) => unit.templateId === GUARD_TEMPLATE)
    .map((unit) => unit.pos);
}

// ===========================================
// Table
// ===========================================

describe("HIVE_ASSAULT_SETUP", () => {
  it("is the table's rule for the type", () => {
    expect(MISSION_SETUP_RULES["hive-assault"]).toBe(HIVE_ASSAULT_SETUP);
    expect(HIVE_ASSAULT_SETUP.typeId).toBe("hive-assault");
  });

  it("sleeps a brood in every chamber of a real cavern (#1179, arc §7.5)", () => {
    const { mission, map } = hiveCavern("temperate", "hive-1");
    const chambers = allHooks(map.hooks).filter(
      (hook) => hook.kind === HookKinds.BROOD_CHAMBER,
    );
    const placed = HIVE_ASSAULT_SETUP.setup(landed(map), map, mission, {
      ...deps(),
      broods: { species: Object.values(BUG_SPECIES), tuning: BROOD_TUNING },
    });
    if (!placed.ok) throw new Error(JSON.stringify(placed.error));

    expect(chambers.length).toBeGreaterThan(0);
    expect((placed.value.broods ?? []).length).toBe(chambers.length);
    expect(placed.value.units.filter(isDormant).length).toBeGreaterThan(0);
  }, 60_000);
});

// ===========================================
// Scaling
// ===========================================

describe("hive scaling", () => {
  it("gives the core 60 hit points and 15 more a level", () => {
    expect(
      [0, 1, 2, 6, -1].map((level) =>
        hiveCoreHp(level, HIVE_ASSAULT_SETUP_TUNING),
      ),
    ).toEqual([60, 75, 90, 150, 60]);
  });

  it("stands two guards, one more every second level, never more than four", () => {
    expect(
      [0, 1, 2, 3, 4, 9].map((level) =>
        hiveGuardCount(level, HIVE_ASSAULT_SETUP_TUNING),
      ),
    ).toEqual([2, 2, 3, 3, 4, 4]);
  });
});

// ===========================================
// Guard positions
// ===========================================

describe("hiveGuardPositions", () => {
  it("rings the pad two tiles out, nearest the drop ship first, spread apart", () => {
    expect(hiveGuardPositions(cavernFloor())).toEqual([
      at(4, 4),
      at(6, 4),
      at(4, 6),
      at(8, 4),
    ]);
  });

  it("never stands a guard on a hook", () => {
    const positions = hiveGuardPositions(cavernFloor(at(4, 4)));

    expect(positions).not.toContainEqual(at(4, 4));
    expect(positions[0]).toEqual(at(5, 4));
  });

  it("tops up to two when a cramped chamber has no room to spread them", () => {
    // Only a one-tile tunnel leaves the pad: ring 2 is (0, 4), ring 3 (0, 5).
    const builder = new FixtureMapBuilder(3, 7, 3 * STOREY_LAYERS).fillGround();
    for (let z = 3; z < 7; z++) {
      builder.removeTile(at(1, z)).removeTile(at(2, z));
    }
    const map = builder
      .deploy([at(0, 6)])
      .objective(
        HookKinds.HIVE_CORE,
        [0, 1, 2].flatMap((z) => [0, 1, 2].map((x) => at(x, z))),
        PassMask.ALL,
        { footprint: 3 },
      )
      .build();

    expect(hiveGuardPositions(map)).toEqual([at(0, 4), at(0, 5)]);
  });

  it("is empty on a map with no hive core", () => {
    expect(
      hiveGuardPositions(
        new FixtureMapBuilder(8, 8, 3 * STOREY_LAYERS).fillGround().build(),
      ),
    ).toEqual([]);
  });
});

// ===========================================
// Setup
// ===========================================

describe("setUpHiveAssault", () => {
  it("stands the core on the pad with its level's hit points and its objective", () => {
    const state = setUp(cavernFloor(), 2);

    expect(state.spawners[0]).toEqual({
      id: "spawner-1",
      variant: "hive-core",
      pos: at(6, 6),
      hatchRadius: DEFAULT_HATCH_RADIUS,
      hp: 90,
      maxHp: 90,
      timer: 0,
      destroyed: false,
    });
    expect(state.objectives).toEqual([
      {
        id: "objective-1",
        kind: "destroy-hive-core",
        targetId: "spawner-1",
        complete: false,
      },
    ]);
  });

  it("stands a nest on every egg hook as optional pressure: a bounty, no objective", () => {
    const state = setUp(cavernFloor(), 0);
    const nests = state.spawners.slice(1);

    expect(
      nests.map((nest) => [
        nest.variant ?? "egg-spawner",
        nest.pos,
        nest.bounty,
      ]),
    ).toEqual([
      ["egg-spawner", at(1, 12), HIVE_ASSAULT_SETUP_TUNING.nestBounty],
      ["egg-spawner", at(12, 1), HIVE_ASSAULT_SETUP_TUNING.nestBounty],
    ]);
    expect(nests.every((nest) => nest.variant !== "hive-core")).toBe(true);
    expect(state.objectives.map((objective) => objective.kind)).toEqual([
      "destroy-hive-core",
    ]);
  });

  it("stands the level's number of guards on the best guard tiles", () => {
    const positions = hiveGuardPositions(cavernFloor());

    expect(guardsOf(setUp(cavernFloor(), 0))).toEqual(positions.slice(0, 2));
    expect(guardsOf(setUp(cavernFloor(), 2))).toEqual(positions.slice(0, 3));
    expect(guardsOf(setUp(cavernFloor(), 9))).toEqual(positions);
  });

  it("reads an offer with no hive as a level-0 hive", () => {
    expect(setUp(cavernFloor(), undefined)).toEqual(setUp(cavernFloor(), 0));
  });

  it("keeps the squad and appends to what the mission already had", () => {
    const state = setUp(cavernFloor(), 0);

    expect(state.units[0]?.id).toBe("squad");
    expect(state.units).toHaveLength(3);
  });

  it("hands the finished mission to the broods seam last, and returns what it gives back", () => {
    const map = cavernFloor();
    const seen: TacticalState[] = [];
    const rule = createHiveAssaultSetup((state, seamMap) => {
      expect(seamMap).toBe(map);
      seen.push(state);
      return { ...state, turn: 99 };
    });

    const placed = rule.setup(
      landed(map),
      map,
      {
        ...offer(1),
        id: "m",
        typeId: "hive-assault",
      } as unknown as Mission,
      deps(),
    );

    expect(seen).toHaveLength(1);
    expect(guardsOf(seen[0] ?? landed(map))).toHaveLength(2);
    expect(seen[0]?.objectives).toHaveLength(1);
    expect(placed.ok && placed.value.turn).toBe(99);
  });

  it("stands no broods by default", () => {
    const state = landed(cavernFloor());

    expect(NO_BROODS(state, cavernFloor(), deps())).toBe(state);
  });

  it("refuses a map with no hive-core hook", () => {
    const bare = new FixtureMapBuilder(8, 8, 3 * STOREY_LAYERS)
      .fillGround()
      .build();

    expect(setUpHiveAssault(landed(bare), bare, offer(1), deps())).toEqual({
      ok: false,
      error: { kind: "map-recipe", reason: "no hive-core hook on the map" },
    });
  });
});

// ===========================================
// Generated caverns
// ===========================================

/** A level-3 Hive Assault offer and the hive cavern generated for it. */
function hiveCavern(
  biome: Mission["mapParams"]["biome"],
  seed: string,
): { mission: Mission; map: TacticalMap } {
  const mission: Mission = {
    id: "mission-1",
    typeId: "hive-assault",
    cityId: "city-1",
    difficulty: 6,
    mapParams: { biome, settlement: "city", size: "large", seed },
    hive: { hiveId: "hive-1", regionId: "east", level: 3 },
    rewards: { credits: 1800, techPoints: 56 },
    createdDay: 30,
    expiresDay: 37,
    ignorePenalty: 0,
    pinned: true,
  };
  const recipe = missionToMapRecipe(mission, HIVE_ASSAULT);
  if (!recipe.ok) throw new Error(seed);
  return { mission, map: generateTacticalMap(recipe.value) };
}

describe("setUpHiveAssault on generated hive caverns", () => {
  /** Seeds and biomes; one cavern each, at level 3 (three guards). */
  const CAVERNS = [
    ["temperate", "hive-1"],
    ["desert", "hive-2"],
    ["snowy", "hive-3"],
  ] as const;

  it("stands the core on its pad and two to four guards in the core's chamber", () => {
    for (const [biome, seed] of CAVERNS) {
      const { map } = hiveCavern(biome, seed);
      const hooks = allHooks(map.hooks);
      const pad = hooks.find((hook) => hook.kind === HookKinds.HIVE_CORE);
      const chamber = hooks.find(
        (hook) =>
          hook.kind === HookKinds.BROOD_CHAMBER && hook.meta?.role === "core",
      );
      const radius = chamber?.meta?.radius;
      if (pad === undefined || chamber === undefined) throw new Error(seed);
      if (typeof radius !== "number") throw new Error(seed);

      const state = setUp(map, 3);
      const guards = guardsOf(state);

      expect(state.spawners[0]?.pos, seed).toEqual(pad.tiles[0]);
      expect(state.objectives[0]?.kind, seed).toBe("destroy-hive-core");
      expect(guards.length, seed).toBeGreaterThanOrEqual(2);
      expect(guards.length, seed).toBeLessThanOrEqual(4);
      expect(guards, seed).toEqual(hiveGuardPositions(map).slice(0, 3));
      for (const guard of guards) {
        const home = chamber.tiles[0] ?? guard;
        expect(guard.y, seed).toBe(pad.tiles[0]?.y);
        expect(chebyshevDistance(guard, home), seed).toBeLessThanOrEqual(
          radius,
        );
      }
    }
  }, 60_000);

  it("takes placeCavernBroods as its broods seam: sleepers in the chambers, the core and its guards untouched", () => {
    const { mission, map } = hiveCavern("temperate", "hive-1");
    const chambers = allHooks(map.hooks).filter(
      (hook) => hook.kind === HookKinds.BROOD_CHAMBER,
    );
    const withBroods: MissionSetupDeps = {
      ...deps(),
      broods: { species: Object.values(BUG_SPECIES), tuning: BROOD_TUNING },
    };

    const bare = setUp(map, 3);
    const placed = createHiveAssaultSetup(placeCavernBroods).setup(
      landed(map),
      map,
      mission,
      withBroods,
    );
    if (!placed.ok) throw new Error(JSON.stringify(placed.error));
    const state = placed.value;
    const broods = state.broods ?? [];
    const sleepers = state.units.filter(isDormant);
    const core = new Set(
      spawnerFootprintTiles(bare.spawners[0] ?? { pos: at(0, 0) }).map(
        (tile) => `${String(tile.x)},${String(tile.z)}`,
      ),
    );

    expect(chambers.length).toBeGreaterThan(0);
    expect(broods.map((brood) => brood.id)).toEqual(
      chambers.map((hook) => `brood-${String(hook.meta?.chamberId)}`),
    );
    expect(sleepers.map((unit) => unit.id).sort()).toEqual(
      broods.flatMap((brood) => brood.memberIds).sort(),
    );
    expect(
      sleepers.filter((unit) =>
        core.has(`${String(unit.pos.x)},${String(unit.pos.z)}`),
      ),
    ).toEqual([]);
    expect(state.spawners).toEqual(bare.spawners);
    expect(state.objectives).toEqual(bare.objectives);
    expect(guardsOf(state)).toEqual(guardsOf(bare));
    expect(
      state.units.filter(
        (unit) => unit.templateId === GUARD_TEMPLATE && isDormant(unit),
      ),
    ).toEqual([]);
  }, 60_000);
});
