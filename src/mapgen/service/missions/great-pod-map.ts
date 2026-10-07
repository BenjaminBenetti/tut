import { GREAT_POD_MISSION_HOOKS } from "../../data/great-pod-recipe";
import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Great pod map rule
// ===========================================

/**
 * A crash site whose pod came down whole (#1238): the `great-pod`
 * archetype — open ground, debris, and a sealed pod of hull plates,
 * chambers and a core the squad breaches its way into — on the
 * mission's own board, with the pod's hook list in place of the type's
 * (deploy, the core, two edge spawns, extraction; the carcass appended).
 *
 * ```
 *   archetype  "great-pod"
 *   size       the mission's (Act I's 48²)
 *   hooks      GREAT_POD_MISSION_HOOKS (+ carcass)
 * ```
 *
 * It is a crash site's rule, so a table entry sends a crash-site story
 * to it (`STORY_MAP_RULES`); First Skyfall is the one it serves today.
 */
export const GREAT_POD_MAP_RULE: MissionMapRule = {
  typeId: "crash-site",

  /** The great pod, with its own hooks on the mission's board. */
  recipe(): MissionMapPlan {
    return {
      archetype: "great-pod",
      extraHooks: [],
      hooks: GREAT_POD_MISSION_HOOKS,
    };
  },
};
