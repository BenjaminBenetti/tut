import type { TacticalState } from "../../../tactical/model/tactical-state";
import { activeSitreps } from "../../../tactical/service/sitreps/sitrep-service";
import { SITREP_PRESENTATION } from "../../data/sitrep-presentation";
import type {
  SitrepCountdown,
  SitrepPresentationCatalogue,
} from "../../model/sitrep-presentation";
import { countdownAt } from "./deadline-countdown";

// ===========================================
// Mission query
// ===========================================

/**
 * Every countdown the mission's sitreps have running, in `SITREP_IDS`
 * order: one per sitrep whose presentation has a `deadline` and whose
 * turn this mission set and has not yet passed. None once the mission
 * has ended.
 *
 * ```
 *   sitreps [dust-off-window], dustOffTurn 20, turn 18
 *     ──► [{ sitrepId: "dust-off-window", name: "Dust-off Window",
 *            text: "Drop ship leaves in 3 turns", turnsLeft: 3, urgent: false }]
 * ```
 *
 * The HUD hands them to the tracker as rows under the objectives, and
 * folds them into the banner's soonest, so both show one reading.
 *
 * @param mission - The mission in progress.
 * @param presentation - How each sitrep is shown; the shipped table by default.
 */
export function sitrepCountdowns(
  mission: TacticalState,
  presentation: SitrepPresentationCatalogue = SITREP_PRESENTATION,
): readonly SitrepCountdown[] {
  if (mission.outcome !== undefined) {
    return [];
  }
  const countdowns: SitrepCountdown[] = [];
  for (const id of activeSitreps(mission)) {
    const { name, deadline } = presentation[id];
    const turn = deadline?.turn(mission);
    if (deadline === undefined || turn === undefined) {
      continue;
    }
    const countdown = countdownAt(turn, mission.turn, deadline.phrase);
    if (countdown !== undefined) {
      countdowns.push({ ...countdown, sitrepId: id, name });
    }
  }
  return countdowns;
}
