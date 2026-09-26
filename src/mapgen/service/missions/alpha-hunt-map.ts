import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Alpha Hunt map rule
// ===========================================

/**
 * An Alpha Hunt (campaign arc §6.8) is a chase through the host city:
 * the settlement pipeline, as the clearance fights, with the type's own
 * hooks (one or two egg spawners, two edge spawn zones, deploy and
 * extraction) and nothing more. The Broodmother herself is not a hook:
 * the type's tactical setup places her.
 *
 * Why the settlement and not the crash-site crater: the crater is cut
 * for a pod a short walk from deploy, with a rim that funnels the
 * approach, so it has no room to run. The settlement is open ground and
 * streets out to every edge, so a fleeing Broodmother always has a way
 * out and the squad a way to cut her off. The room comes from the size:
 * `MISSION_TUNING.difficulty["alpha-hunt"]` never generates it small,
 * so every hunt is 72 tiles across or more.
 */
export const ALPHA_HUNT_MAP_RULE: MissionMapRule = {
  typeId: "alpha-hunt",

  /** A settlement map with no extra hooks, site or landmark. */
  recipe(): MissionMapPlan {
    return { archetype: "settlement", extraHooks: [] };
  },
};
