import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Crash Site map rule
// ===========================================

/**
 * A crash site (arc §6.3, §7) is fought where the pod came down: the
 * crater archetype (open ground, a terraced bowl, debris cover), with
 * nothing beyond the type's own hooks. Its `requiredHooks` are
 * `CRASH_SITE_MISSION_HOOKS` in content vocabulary: deploy, the pod,
 * two edge spawns and the extraction.
 *
 * ```
 *   any crash site  ──► archetype "crash-site", no extra hooks
 * ```
 *
 * First Skyfall is not planned here: its pod came down whole, and
 * `STORY_MAP_RULES` sends it to the great pod's rule (#1238).
 */
export const CRASH_SITE_MAP_RULE: MissionMapRule = {
  typeId: "crash-site",

  /** The crater, with the type's own hooks. */
  recipe(): MissionMapPlan {
    return { archetype: "crash-site", extraHooks: [] };
  },
};
