import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../../bugs/data/species";
import { HIVE_ASSAULT } from "../../../content/data/mission-types";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { allHooks, HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import { generateTacticalMap } from "../../../mapgen/service/generate-tactical-map";
import { missionToMapRecipe } from "../../../mapgen/service/mission-map-recipe-adapter";
import type { Mission } from "../../../overworld/model/mission";
import { BROOD_TUNING } from "../../data/brood-tuning";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { GREAT_HIVE_SETUP_TUNING } from "../../data/great-hive-setup-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type { TacticalState } from "../../model/tactical-state";
import { isDormant } from "../../model/unit";
import { missionWith, unitAt } from "../tactical-fixtures.test-helper";
import { templateIdFor } from "../unit-factory";
import { withGreatHiveSetup } from "./great-hive-setup";
import { HIVE_ASSAULT_SETUP } from "./hive-assault-setup";
import { MISSION_SETUP_RULES } from "./mission-setup-rules";

// ===========================================
// Fixtures
// ===========================================

/** The Hive Guard's template id. */
const GUARD_TEMPLATE = templateIdFor("bug", "hive-guard");

/** Seeds and biomes of the generated caverns compared. */
const CAVERNS = [
  ["temperate", "gh-1"],
  ["desert", "gh-2"],
  ["snowy", "gh-3"],
] as const;

/** Time for two cavern generations and setups on a loaded runner. */
const CAVERN_TIMEOUT_MS = 120_000;

/** A d8 Hive Assault offer against a hive of `level`, a Great Hive when `great`. */
function assault(
  level: number,
  great: boolean,
  biome: Mission["mapParams"]["biome"] = "temperate",
  seed = "gh-1",
): Mission {
  return {
    id: "mission-1",
    typeId: "hive-assault",
    cityId: "city-1",
    difficulty: 8,
    mapParams: { biome, settlement: "city", size: "large", seed },
    hive: {
      hiveId: great ? "greathive-1" : "hive-1",
      regionId: "east",
      level,
      ...(great ? { great: true as const } : {}),
    },
    rewards: { credits: 1800, techPoints: 170 },
    createdDay: 200,
    expiresDay: 207,
    ignorePenalty: 0,
    pinned: true,
  };
}

/** The cavern the shipped adapter and map table generate for `mission`. */
function cavernFor(mission: Mission): TacticalMap {
  const recipe = missionToMapRecipe(mission, HIVE_ASSAULT);
  if (!recipe.ok) {
    throw new Error(`no recipe: ${JSON.stringify(recipe.error)}`);
  }
  return generateTacticalMap(recipe.value);
}

/** Setup deps over fresh ids and the shipped tunings, broods and all. */
function deps(): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
    greatHive: GREAT_HIVE_SETUP_TUNING,
    broods: { species: Object.values(BUG_SPECIES), tuning: BROOD_TUNING },
  };
}

/** The mission a squad lands in on `map`, before the setup rule. */
function landed(map: TacticalMap): TacticalState {
  const [deploy] = map.hooks.deployZones[0]?.tiles ?? [];
  if (deploy === undefined) {
    throw new Error("The cavern has a drop zone");
  }
  return missionWith(map, [unitAt("squad", "infantry", deploy)]);
}

/** Runs the shipped table's rule for `mission` on `map`; throws on a refusal. */
function setUp(
  map: TacticalMap,
  mission: Mission,
  with_: MissionSetupDeps = deps(),
): TacticalState {
  const placed = MISSION_SETUP_RULES["hive-assault"].setup(
    landed(map),
    map,
    mission,
    with_,
  );
  if (!placed.ok) {
    throw new Error(`setup refused: ${JSON.stringify(placed.error)}`);
  }
  return placed.value;
}

/** What a setup stood in the cavern, counted. */
function census(state: TacticalState, map: TacticalMap) {
  const core = state.spawners.find((s) => s.variant === "hive-core");
  return {
    tiles: map.width * map.depth,
    chambers: allHooks(map.hooks).filter(
      (hook) => hook.kind === HookKinds.BROOD_CHAMBER,
    ).length,
    nests: state.spawners.filter((s) => s.variant !== "hive-core").length,
    coreHp: core?.maxHp ?? 0,
    guards: state.units.filter((unit) => unit.templateId === GUARD_TEMPLATE)
      .length,
    sleepers: state.units.filter(isDormant).length,
  };
}

// ===========================================
// The decorator
// ===========================================

describe("withGreatHiveSetup", () => {
  it(
    "is what the shipped table runs for an ordinary Hive Assault, unchanged",
    () => {
      const mission = assault(2, false);
      const map = cavernFor(mission);
      const shipped = setUp(map, mission);
      const ordinary = HIVE_ASSAULT_SETUP.setup(
        landed(map),
        map,
        mission,
        deps(),
      );
      expect(ordinary.ok && ordinary.value).toEqual(shipped);
    },
    CAVERN_TIMEOUT_MS,
  );

  it(
    "sets up a Great Hive as an ordinary Hive Assault when no Great Hive tuning is given",
    () => {
      const mission = assault(0, true);
      const map = cavernFor(mission);
      const withoutGreat = (): MissionSetupDeps => {
        const { greatHive: _unused, ...rest } = deps();
        return rest;
      };
      const plain = setUp(map, mission, withoutGreat());
      const ordinary = HIVE_ASSAULT_SETUP.setup(
        landed(map),
        map,
        mission,
        withoutGreat(),
      );
      expect(ordinary.ok && ordinary.value).toEqual(plain);
      expect(census(plain, map).coreHp).toBe(HIVE_ASSAULT_SETUP_TUNING.coreHp);
    },
    CAVERN_TIMEOUT_MS,
  );

  it(
    "hands the Great Hive's tuning to the broods seam it is built with",
    () => {
      const mission = assault(0, true);
      const map = cavernFor(mission);
      const seen: MissionSetupDeps[] = [];
      const rule = withGreatHiveSetup(HIVE_ASSAULT_SETUP, (state, _map, d) => {
        seen.push(d);
        return state;
      });
      const placed = rule.setup(landed(map), map, mission, deps());
      expect(placed.ok).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.hiveAssault).toBe(GREAT_HIVE_SETUP_TUNING.assault);
      expect(seen[0]?.broods?.tuning).toBe(GREAT_HIVE_SETUP_TUNING.broods);
    },
    CAVERN_TIMEOUT_MS,
  );
});

// ===========================================
// Oversized
// ===========================================

describe("a Great Hive against an ordinary hive at the same level and seed", () => {
  it(
    "is a bigger board with more chambers and nests, a tougher core and more guards",
    () => {
      for (const [biome, seed] of CAVERNS) {
        const ordinaryMission = assault(0, false, biome, seed);
        const greatMission = assault(0, true, biome, seed);
        const ordinaryMap = cavernFor(ordinaryMission);
        const greatMap = cavernFor(greatMission);
        const ordinary = census(
          setUp(ordinaryMap, ordinaryMission),
          ordinaryMap,
        );
        const great = census(setUp(greatMap, greatMission), greatMap);

        expect(great.tiles, seed).toBeGreaterThan(ordinary.tiles);
        expect(great.chambers, seed).toBeGreaterThan(ordinary.chambers);
        expect(great.nests, seed).toBeGreaterThan(ordinary.nests);
        expect(ordinary.coreHp, seed).toBe(60);
        expect(great.coreHp, seed).toBe(200);
        expect(ordinary.guards, seed).toBe(2);
        expect(great.guards, seed).toBe(6);
        expect(great.sleepers, seed).toBeGreaterThan(0);
      }
    },
    CAVERN_TIMEOUT_MS * 2,
  );

  it(
    "grows by level: a twice-repelled Great Hive has 240 hp and eight guards",
    () => {
      const mission = assault(2, true);
      const map = cavernFor(mission);
      const great = census(setUp(map, mission), map);
      expect(great.coreHp).toBe(240);
      expect(great.guards).toBe(8);
    },
    CAVERN_TIMEOUT_MS,
  );
});
