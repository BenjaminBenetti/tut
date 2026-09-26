import type { Mission } from "../../../overworld/model/mission";
import { CIVILIAN_MISSION_HOOKS } from "../../data/hook-requirements";
import { HookKinds } from "../../model/hook";
import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Constants
// ===========================================

/**
 * Groups an evacuation offer without its spec traps: the civilian
 * hook set's own count, so such an offer (which the director never
 * makes) is still an evacuation rather than an empty town.
 */
export const DEFAULT_EVACUATION_GROUPS: number =
  CIVILIAN_MISSION_HOOKS.find((hook) => hook.kind === HookKinds.CIVILIAN)
    ?.count ?? 4;

// ===========================================
// Evacuation map rule
// ===========================================

/**
 * An evacuation (campaign arc §6.4) is fought in the host city: the
 * settlement pipeline, with one civilian hook per trapped group on top
 * of the type's own hooks (deploy, a modest egg-spawner count, the edge
 * spawns and the extraction come from `requiredHooks`). The adapter
 * completes the civilian requirement from `HOOK_KIND_DEFAULTS`, so it
 * is `CIVILIAN_MISSION_HOOKS`' entry with the offer's count: infantry
 * reach, six or more tiles from deploy, one group to a building.
 *
 * ```
 *   mission.evacuation.groups ──► { kind: civilian, count: groups }
 *   no spec                   ──► the civilian hook set's four
 * ```
 */
export const EVACUATION_MAP_RULE: MissionMapRule = {
  typeId: "evacuation",

  /** A settlement map with one civilian hook per group. */
  recipe(mission: Mission): MissionMapPlan {
    return {
      archetype: "settlement",
      extraHooks: [
        {
          kind: HookKinds.CIVILIAN,
          count: mission.evacuation?.groups ?? DEFAULT_EVACUATION_GROUPS,
        },
      ],
    };
  },
};
