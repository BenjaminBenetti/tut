import type { MissionOutcome } from "../../overworld/model/mission-result";
import { MISSION_ENDED } from "../model/mission-ended-event";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import { isCombatUnit, isStandingForce } from "../model/unit";

import {
  decidingObjectives,
  objectiveComplete,
} from "./objectives/objective-status";

// ===========================================
// Outcome
// ===========================================

/**
 * Whether the mission is over and how it ended (GDD §6.3), or undefined
 * while it is still being played:
 *
 * ```
 *   every deciding objective complete  ──► won
 *   a TDF unit still standing          ──► undefined (play on)
 *   nobody standing, somebody got out  ──► extracted
 *   nobody standing, nobody got out    ──► lost
 * ```
 *
 * Finishing the objectives does not end the mission: the force still
 * has to get home (Executive Director, review of #1113). So the mission
 * ends only when nobody of the player's is left on the map — extracted
 * or dead — and the outcome is read from what they achieved: every
 * deciding objective complete and someone out is **won**; someone out
 * with a deciding objective open is **extracted**; nobody out is
 * **lost**, whatever they finished, because nobody came home to say
 * so. A deployed turret is not somebody (#1138): it cannot come home,
 * so a turret still standing after the last squad has gone keeps
 * nothing open. Neither is a civilian group (campaign arc §6.4): it is
 * who the force came for, so the force leaving or falling ends the
 * mission with any group still on the map lost, and a group that got
 * out alone is not somebody of the force coming home. An objective
 * marked `optional` never decides (#1179): Live Specimen is won once
 * the specimen is home, nests or no nests.
 *
 * ```
 *   a TDF unit still standing          ──► undefined (play on)
 *   nobody extracted                   ──► lost
 *   deciding objectives all complete   ──► won
 *   otherwise                          ──► extracted
 * ```
 *
 * A pure predicate over the state, deliberately owned by neither the
 * turn engine nor the objectives: the turn boundary asks it, and so do
 * the rules that can decide a mission mid-phase — planting charges,
 * extracting, and shooting the last spawner (#426). Keeping it here is
 * what lets the combat service end a mission without importing the turn
 * engine that imports the combat service.
 */
export function missionOutcome(
  mission: TacticalState,
): MissionOutcome | undefined {
  if (mission.units.some(isStandingForce)) {
    return undefined;
  }
  if (!forceExtracted(mission)) {
    return "lost";
  }
  return objectivesComplete(mission) ? "won" : "extracted";
}

/**
 * Whether every deciding objective is done — the moment the HUD tells
 * the player to head for the drop ship. Optional objectives are not
 * asked (#1179). A mission with no deciding objective can only be
 * extracted from, never won.
 *
 * ```
 *   deciding = objectives with optional ≠ true
 *   deciding non-empty ∧ every one complete
 * ```
 *
 * @param mission - The mission to read.
 * @returns True once every deciding objective is complete.
 */
export function objectivesComplete(mission: TacticalState): boolean {
  const deciding = decidingObjectives(mission.objectives);
  return (
    deciding.length > 0 &&
    deciding.every((objective) => objectiveComplete(mission, objective))
  );
}

/**
 * Whether any member of the force got out (campaign arc §6.4): a squad
 * or a mech among the extracted. Civilians aboard are rescued, not the
 * force coming home, so they alone do not turn a loss into an
 * extraction.
 *
 * @param mission - The mission to read.
 * @returns True once a squad or mech has boarded.
 */
export function forceExtracted(mission: TacticalState): boolean {
  return mission.extracted.some(isCombatUnit);
}

// ===========================================
// Ending
// ===========================================

/**
 * Records the outcome and announces `MissionEnded` when a terminal
 * condition now holds, otherwise hands the mission back untouched. The
 * turn engine runs the same check at every turn boundary; objectives,
 * extraction and spawner-killing fire can decide a mission mid-phase,
 * and this is where they ask.
 */
export function endIfOver(
  mission: TacticalState,
  events: readonly TacticalEvent[],
): TacticalApplied<TacticalState> {
  const outcome = missionOutcome(mission);
  if (outcome === undefined) {
    return { state: mission, events: [...events] };
  }
  return {
    state: { ...mission, outcome },
    events: [
      ...events,
      { type: MISSION_ENDED, payload: { outcome, turn: mission.turn } },
    ],
  };
}
