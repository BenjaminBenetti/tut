import { err, ok } from "../../core/model/result";
import type { MissionOutcome } from "../../overworld/model/mission-result";
import type { AbandonMissionCommand } from "../model/abandon-mission-command";
import { MISSION_ENDED } from "../model/mission-ended-event";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { UNIT_ABANDONED } from "../model/unit-abandoned-event";
import { objectivesComplete } from "./mission-end-service";

import { isGenerator } from "../model/generator";
import { objectiveComplete } from "./defence-service";

// ===========================================
// Types
// ===========================================

/** One unit that leaving now would strand. */
export interface LeftBehindUnit {
  readonly unitId: UnitId;
  /** Its roster entry, so the dialog and the debrief can name it. */
  readonly sourceId: string;
}

/**
 * What leaving the mission where it stands would cost (#1132): the units
 * that are not aboard, how many objectives are still open, and the
 * outcome the mission would be recorded with. The screen shows this
 * before it asks for the command, and the rules produce the same answer
 * when the command lands.
 */
export interface LeaveMissionSummary {
  /** Living TDF units still on the map, in `units` order. */
  readonly leftBehind: readonly LeftBehindUnit[];
  /** Objectives not yet complete. */
  readonly objectivesOpen: number;
  /** How the mission would be recorded. */
  readonly outcome: MissionOutcome;
  /** True when leaving costs nothing: everyone is aboard and the job is done. */
  readonly free: boolean;
}

// ===========================================
// Summary
// ===========================================

/**
 * The cost of leaving `mission` now (#1132). Pure: reads the mission and
 * nothing else, so the confirm dialog and the handler agree by
 * construction.
 *
 * ```
 *   leftBehind     = living TDF units in `units` (not in `extracted`)
 *   objectivesOpen = objectives with complete: false
 *   outcome        = every objective complete and someone aboard ──► won
 *                    otherwise ─────────────────────────────────► lost
 * ```
 *
 * An incomplete mission that is left is failed, whoever got out: the
 * Executive Director's rule (2026-09-13) is that leaving is bailing out,
 * not extracting. Only a force that finished the job and has at least
 * one unit aboard brings a win home, with whoever it left behind as the
 * price.
 *
 * @param mission - The mission as it stands.
 * @returns What leaving would cost.
 */
export function leaveMissionSummary(
  mission: TacticalState,
): LeaveMissionSummary {
  const leftBehind = standingUnits(mission).map((unit) => ({
    unitId: unit.id,
    sourceId: unit.sourceId,
  }));
  const objectivesOpen = mission.objectives.filter(
    (objective) => !objectiveComplete(mission, objective),
  ).length;
  const outcome: MissionOutcome =
    objectivesComplete(mission) && mission.extracted.length > 0
      ? "won"
      : "lost";
  return {
    leftBehind,
    objectivesOpen,
    outcome,
    free: leftBehind.length === 0 && objectivesOpen === 0,
  };
}

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `AbandonMission` handler (#1132). In the player's phase of a
 * mission still in play, every living TDF unit on the map is left behind
 * — its hit points go to zero, so the resolver reads it as wiped or
 * destroyed exactly as if it had fallen — and the mission ends with the
 * outcome `leaveMissionSummary` promised.
 *
 * ```
 *   bug phase ──► not-player-phase
 *          │
 *   units: living TDF ──► hp 0, UnitAbandoned each (units order)
 *   outcome ──► recorded, MissionEnded { outcome, turn }
 * ```
 *
 * The lifting adapter refuses a mission that already has an outcome, so
 * the handler does not check it twice. Extracted units are untouched:
 * they are home, whatever happens to the rest.
 */
export function createAbandonMissionHandler(): TacticalHandler<AbandonMissionCommand> {
  return (mission) => {
    if (mission.phase !== "player") {
      return err({ kind: "not-player-phase" });
    }
    const summary = leaveMissionSummary(mission);
    const stranded = new Set(summary.leftBehind.map((unit) => unit.unitId));
    const units = mission.units.map((unit) =>
      stranded.has(unit.id) ? { ...unit, hp: 0 } : unit,
    );
    const events: TacticalEvent[] = summary.leftBehind.map((unit) => ({
      type: UNIT_ABANDONED,
      payload: { unitId: unit.unitId },
    }));
    events.push({
      type: MISSION_ENDED,
      payload: { outcome: summary.outcome, turn: mission.turn },
    });
    return ok({
      state: { ...mission, units, outcome: summary.outcome },
      events,
    });
  };
}

// ===========================================
// Helpers
// ===========================================

/** The player's units still alive on the map. */
function standingUnits(mission: TacticalState): readonly Unit[] {
  // A generator is the installation's, not the force's (#1175): it is
  // neither stranded nor written off when the squad leaves.
  return mission.units.filter(
    (unit) => unit.team === "tdf" && unit.hp > 0 && !isGenerator(unit),
  );
}
