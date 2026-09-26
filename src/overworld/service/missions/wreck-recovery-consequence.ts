import type { Mission } from "../../model/mission";
import type { MissionConsequenceRule } from "../../model/mission-consequence-rule";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import { removeWreck } from "../wreck-service";

// ===========================================
// Wreck recovery: consequences
// ===========================================

/**
 * What a wreck recovery does to the overworld (arc §6.6, D6): it spends
 * the wreck's one attempt, whatever happened, and nothing else. The
 * city's infestation is untouched either way: the mission pays parts
 * only, and a wreck nobody went back for costs only its parts.
 *
 * ```
 *   played  wrecks − this mech's record   (won: the parts reach the stock through
 *                                          result.partsAwarded, which the launch
 *                                          handler pays like credits)
 *   lapsed  wrecks − this mech's record
 * ```
 *
 * The parts are not this rule's to pay: a consequence rule moves the
 * overworld, and the stock is the roster's. `partsFor` puts them on the
 * result on a win, and the launch handler hands them to the roster.
 */
export const WRECK_RECOVERY_CONSEQUENCE: MissionConsequenceRule = {
  typeId: "wreck-recovery",

  /** The attempt is spent: the wreck's record goes. */
  onResolved(
    state: OverworldState,
    mission: Mission,
  ): OverworldApplied<OverworldState> {
    return { state: spent(state, mission), events: [] };
  },

  /** Left to lapse: the attempt is spent all the same. */
  onExpired(
    state: OverworldState,
    mission: Mission,
  ): OverworldApplied<OverworldState> {
    return { state: spent(state, mission), events: [] };
  },
};

// ===========================================
// Helpers
// ===========================================

/** The overworld without the record of the mission's wreck. */
function spent(state: OverworldState, mission: Mission): OverworldState {
  return mission.wreck === undefined
    ? state
    : removeWreck(state, mission.wreck.mechId);
}
