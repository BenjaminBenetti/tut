import type { MissionType } from "../../../content/model/mission-type";
import type { Mission } from "../../../overworld/model/mission";
import { isGreatHiveAssault } from "../../../overworld/model/hive-assault-spec";
import {
  GREAT_HIVE_CAVERN_HOOKS,
  GREAT_HIVE_CAVERN_SIZE,
} from "../../data/great-hive-cavern-recipe";
import { GREAT_HIVE_NEST_TUNING } from "../../data/great-hive-nest-tuning";
import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";
import { createHiveAssaultMapRule } from "./hive-assault-map";

// ===========================================
// Great Hive map rule
// ===========================================

/**
 * The Great Hive's map (campaign arc §6.9): the Hive Assault's plan on
 * the Great Hive's own board, hooks and nests, built by the
 * `great-hive-cavern` pass list (more and larger chambers, a bigger core
 * chamber, one more burrow).
 *
 * ```
 *   archetype  "great-hive-cavern"
 *   size       72 × 184
 *   hooks      Great Hive cavern hooks, egg-spawner count =
 *              hiveNestCount(mission.hive.level, GREAT_HIVE_NEST_TUNING)
 * ```
 */
const GREAT_HIVE_PLAN: MissionMapRule = createHiveAssaultMapRule(
  GREAT_HIVE_CAVERN_SIZE,
  GREAT_HIVE_CAVERN_HOOKS,
  GREAT_HIVE_NEST_TUNING,
);

/** The shipped Great Hive map rule; see `GREAT_HIVE_PLAN`. */
export const GREAT_HIVE_MAP_RULE: MissionMapRule = {
  typeId: "hive-assault",

  /** The Great Hive cavern, with the nests the Great Hive's level earns. */
  recipe(mission: Mission, type: MissionType): MissionMapPlan {
    return {
      ...GREAT_HIVE_PLAN.recipe(mission, type),
      archetype: "great-hive-cavern",
    };
  },
};

// ===========================================
// Decorator
// ===========================================

/**
 * `ordinary` — the Hive Assault's map rule — with a Great Hive's assault
 * sent to `great` instead. An offer without `hive.great` is planned by
 * `ordinary` exactly as before.
 *
 * ```
 *   mission.hive.great ?  great.recipe(mission)  :  ordinary.recipe(mission)
 * ```
 */
export function withGreatHiveMap(
  ordinary: MissionMapRule,
  great: MissionMapRule = GREAT_HIVE_MAP_RULE,
): MissionMapRule {
  return {
    typeId: ordinary.typeId,

    /** The Great Hive's plan for a Great Hive assault, the ordinary plan otherwise. */
    recipe(mission: Mission, type: MissionType): MissionMapPlan {
      return isGreatHiveAssault(mission)
        ? great.recipe(mission, type)
        : ordinary.recipe(mission, type);
    },
  };
}
