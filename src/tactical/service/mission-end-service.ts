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
 * Objectives win first: a force that finishes the job as its last unit
 * falls has still finished the job.
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
  if (
    mission.objectives.length > 0 &&
    mission.objectives.every((objective) => objective.complete)
  ) {
    return "won";
  }
  const standing = mission.units.some(
    (unit) => unit.team === "tdf" && unit.hp > 0,
  );
  if (standing) {
    return undefined;
  }
  return mission.extracted.length > 0 ? "extracted" : "lost";
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
