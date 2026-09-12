import type { MissionOutcome } from "../../overworld/model/mission-result";
import { MISSION_ENDED } from "../model/mission-ended-event";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";

// ===========================================
// Outcome
// ===========================================

/**
 * Whether the mission is over and how it ended (GDD §6.3), or undefined
 * while it is still being played:
 *
 * ```
 *   every objective complete           ──► won
 *   a TDF unit still standing          ──► undefined (play on)
 *   nobody standing, somebody got out  ──► extracted
 *   nobody standing, nobody got out    ──► lost
 * ```
 *
 * Finishing the objectives does not end the mission: the force still
 * has to get home (Executive Director, review of #1113). So the mission
 * ends only when nobody of the player's is left on the map — extracted
 * or dead — and the outcome is read from what they achieved: every
 * objective complete and someone out is **won**; someone out with an
 * objective open is **extracted**; nobody out is **lost**, whatever
 * they finished, because nobody came home to say so.
 *
 * ```
 *   a TDF unit still standing ──► undefined (play on)
 *   nobody extracted          ──► lost
 *   objectives all complete   ──► won
 *   otherwise                 ──► extracted
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
  const standing = mission.units.some(
    (unit) => unit.team === "tdf" && unit.hp > 0,
  );
  if (standing) {
    return undefined;
  }
  if (mission.extracted.length === 0) {
    return "lost";
  }
  return objectivesComplete(mission) ? "won" : "extracted";
}

/**
 * Whether every objective is done — the moment the HUD tells the player
 * to head for the drop ship. A mission with no objectives can only be
 * extracted from, never won.
 *
 * @param mission - The mission to read.
 * @returns True once every objective is complete.
 */
export function objectivesComplete(mission: TacticalState): boolean {
  return (
    mission.objectives.length > 0 &&
    mission.objectives.every((objective) => objective.complete)
  );
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
