import { bugMixFor } from "../../../bugs/service/bestiary-service";
import type { CampaignProgress } from "../../model/campaign-progress";
import type { Mission } from "../../model/mission";
import { missionsInAct } from "../campaign-progress-service";

// ===========================================
// Bestiary on the offer
// ===========================================

/**
 * Freezes the species mix on a new offer (ADR 0013 §2.6): the bestiary's
 * mix for the campaign's act and the missions played in it, so the
 * spawns the player meets are the ones the board showed when the offer
 * appeared, whatever debuts before they launch it.
 *
 * ```
 *   progress.act, missionsInAct(progress) ──► bugMixFor ──► mission.bugMix
 * ```
 *
 * An offer that already carries a mix keeps it: a rule that authored its
 * own (a story or hive mission) is not overwritten. Pure; returns a copy
 * and never mutates the input. Shaped for the director's offer
 * decorators (`decorate(mission, state, ctx)`), which pass the state's
 * `progress`.
 *
 * @param mission - The new offer.
 * @param progress - The campaign's progress when the offer is made.
 * @returns The offer with `bugMix` set.
 */
export function withBugMix(
  mission: Mission,
  progress: CampaignProgress,
): Mission {
  if (mission.bugMix !== undefined) {
    return mission;
  }
  return {
    ...mission,
    bugMix: bugMixFor(progress.act, missionsInAct(progress)),
  };
}
