import type { WreckRecoverySpec } from "../../../overworld/model/wreck-recovery-spec";
import { HookKinds } from "../../model/hook";
import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Constants
// ===========================================

/**
 * The side of the square a mech's wreck covers (arc §6.6, the brief's
 * "3×3 for a mech"). Every chassis the game ships is a mech, so every
 * wreck is this size today; a larger class of chassis maps its own
 * side in `wreckFootprint`.
 */
export const MECH_WRECK_FOOTPRINT = 3;

// ===========================================
// Wreck Recovery map rule
// ===========================================

/**
 * A wreck recovery (arc §6.6, §7 item 4) is fought where the mech went
 * down: the settlement pipeline, the type's own threat, and one wreck
 * hook sized to the lost chassis. The adapter completes the hook from
 * `HOOK_KIND_DEFAULTS` (infantry must reach it, 12 to 30 tiles from
 * deploy) and lays this rule's `footprint` over the default.
 *
 * ```
 *   settlement + requiredHooks + { kind: "wreck", count: 1, meta: { footprint } }
 * ```
 *
 * An offer without its `wreck` payload, which the trigger never makes,
 * still gets a mech-sized wreck, so the map never lacks its objective.
 */
export const WRECK_RECOVERY_MAP_RULE: MissionMapRule = {
  typeId: "wreck-recovery",

  /** A settlement map with one chassis-sized wreck. */
  recipe(mission): MissionMapPlan {
    return {
      archetype: "settlement",
      extraHooks: [
        {
          kind: HookKinds.WRECK,
          count: 1,
          meta: { footprint: wreckFootprint(mission.wreck) },
        },
      ],
    };
  },
};

// ===========================================
// Queries
// ===========================================

/**
 * The side of the square the wreck covers: a mech's for every chassis
 * shipped today, and for an offer that lost its payload.
 *
 * @param _wreck - The lost mech, when the offer carries it.
 */
export function wreckFootprint(_wreck: WreckRecoverySpec | undefined): number {
  return MECH_WRECK_FOOTPRINT;
}
