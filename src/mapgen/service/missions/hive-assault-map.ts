import type { Mission } from "../../../overworld/model/mission";
import {
  HIVE_CAVERN_HOOKS,
  HIVE_CAVERN_SIZE,
} from "../../data/hive-cavern-recipe";
import { HIVE_NEST_TUNING } from "../../data/hive-nest-tuning";
import { HookKinds } from "../../model/hook";
import type { HiveNestTuning } from "../../model/hive-nest-tuning";
import type { HookRequirement, MapDimensions } from "../../model/map-recipe";
import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Formulae
// ===========================================

/**
 * The nests (egg spawners) in the cavern of a hive at `level`:
 * `baseNests + floor(nestsPerLevel × level)`, clamped into
 * `[minNests, maxNests]`.
 */
export function hiveNestCount(level: number, tuning: HiveNestTuning): number {
  const raw = tuning.baseNests + Math.floor(tuning.nestsPerLevel * level);
  return Math.min(tuning.maxNests, Math.max(tuning.minNests, raw));
}

// ===========================================
// Hive Assault map rule
// ===========================================

/**
 * The Hive Assault's map rule (campaign arc §6.5, §7.5) over a cavern
 * board, its hook list and the nest tuning. The shipped rule is
 * `HIVE_ASSAULT_MAP_RULE`; tests build their own.
 *
 * The assault is fought in a hive cavern: the `hive-cavern` archetype on
 * its own board with its own hooks, passed here explicitly because only
 * the Map Lab preview fills them in by itself. The cavern's egg-spawner
 * request is replaced by the hive's nest count, so an older hive's
 * cavern holds more nests; every other hook is the cavern's as written.
 * An offer with no `hive` (an older or hand-edited save) is a level-0
 * hive.
 *
 * ```
 *   archetype  "hive-cavern"
 *   size       cavern board (64 × 144)
 *   hooks      cavern hooks, egg-spawner count = hiveNestCount(mission.hive.level)
 *              (+ the mission's carcass, appended by the adapter)
 * ```
 */
export function createHiveAssaultMapRule(
  size: MapDimensions,
  hooks: readonly HookRequirement[],
  nests: HiveNestTuning,
): MissionMapRule {
  return {
    typeId: "hive-assault",

    /** The cavern, with the nests the hive's level earns. */
    recipe(mission: Mission): MissionMapPlan {
      const count = hiveNestCount(mission.hive?.level ?? 0, nests);
      return {
        archetype: "hive-cavern",
        extraHooks: [],
        size,
        hooks: hooks.map((hook) =>
          hook.kind === HookKinds.EGG_SPAWNER ? { ...hook, count } : hook,
        ),
      };
    },
  };
}

/** The shipped Hive Assault map rule: the hive cavern and the default nests. */
export const HIVE_ASSAULT_MAP_RULE: MissionMapRule = createHiveAssaultMapRule(
  HIVE_CAVERN_SIZE,
  HIVE_CAVERN_HOOKS,
  HIVE_NEST_TUNING,
);
