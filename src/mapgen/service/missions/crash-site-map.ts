import type { Mission } from "../../../overworld/model/mission";
import { HookKinds } from "../../model/hook";
import type {
  HookPlacement,
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Constants
// ===========================================

/**
 * Where First Skyfall's pod comes down (campaign arc §6.9: "a scripted
 * pod landing near the start"): at least 6 from the drop zone rather
 * than the kind's 10, and within 14 of it when the board has room, so
 * the first pod a campaign meets is one move and a shot away. The
 * placer still aims at the crater's centre, so the pod sits on the
 * bowl's near side rather than out on the plain.
 */
export const SCRIPTED_POD_PLACEMENT: HookPlacement = {
  minDistanceFromDeploy: 6,
  maxNearestDistanceFromDeploy: 14,
};

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
 *   any crash site         ──► archetype "crash-site", no extra hooks
 *   storyId first-skyfall  ──► + hookPlacement: spore-pod SCRIPTED_POD_PLACEMENT
 * ```
 */
export const CRASH_SITE_MAP_RULE: MissionMapRule = {
  typeId: "crash-site",

  /** The crater, and First Skyfall's pod brought in close to deploy. */
  recipe(mission: Mission): MissionMapPlan {
    if (mission.storyId !== "first-skyfall") {
      return { archetype: "crash-site", extraHooks: [] };
    }
    return {
      archetype: "crash-site",
      extraHooks: [],
      hookPlacement: { [HookKinds.SPORE_POD]: SCRIPTED_POD_PLACEMENT },
    };
  },
};
