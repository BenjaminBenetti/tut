import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";
import {
  SPORE_PLATFORM_CORE_HOOKS,
  SPORE_PLATFORM_CORE_SIZE,
  SPORE_PLATFORM_HULL_HOOKS,
  SPORE_PLATFORM_HULL_SIZE,
} from "../../data/spore-platform-recipe";

// ===========================================
// Spore Platform map rule
// ===========================================

/**
 * The finale's two boards (campaign arc §6.9, ADR 0013 amendment): the
 * mission start asks for stage 0's plan, and the stage advance for
 * stage 1's. Each plan names its own board and hook list, which the
 * recipe adapter uses in place of the named size and the type's hooks
 * (`plan.size`, `plan.hooks`), exactly as the archetype's defaults give
 * them; the offer's size, biome and settlement pass through untouched
 * and the platform passes do not read them.
 *
 * ```
 *   stage 0  spore-platform-hull   72 × 104   deploy, docking ring, hatch,
 *                                             3 pod beds, 2 edge spawns, extraction
 *   stage 1  spore-platform-core   64 × 80    deploy, platform core, dais,
 *                                             4 guard posts, 4 wall pods,
 *                                             2 duct spawns, extraction
 * ```
 */
export const SPORE_PLATFORM_MAP_RULE: MissionMapRule = {
  typeId: "spore-platform",

  /** The hull for stage 0 (and a read that names no stage), the core chamber for any stage after. */
  recipe(_mission, _type, stage = 0): MissionMapPlan {
    return stage < 1
      ? {
          archetype: "spore-platform-hull",
          extraHooks: [],
          size: SPORE_PLATFORM_HULL_SIZE,
          hooks: SPORE_PLATFORM_HULL_HOOKS,
        }
      : {
          archetype: "spore-platform-core",
          extraHooks: [],
          size: SPORE_PLATFORM_CORE_SIZE,
          hooks: SPORE_PLATFORM_CORE_HOOKS,
        };
  },
};
