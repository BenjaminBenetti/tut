import type {
  DefendGeneratorsObjective,
  TacticalState,
} from "../model/tactical-state";
import type { Objective } from "../model/tactical-state";
import type { TacticalApplied } from "../model/tactical-event";
import type { TacticalEvent } from "../model/tactical-event";
import { OBJECTIVE_UPDATED } from "../model/objective-updated-event";
import type { PhaseStep } from "./turn-service";

// ===========================================
// Types
// ===========================================

/** Where a defence stands (#1175): open, held to the end, or lost. */
export type DefendStatus = "open" | "complete" | "failed";

/**
 * The numbers the tracker shows for a defence (#1175).
 *
 * ```
 *   Defend the sensor array   2 / 3 generators · wave 3 / 5 · 4 bugs left
 * ```
 */
export interface DefenceProgress {
  readonly standing: number;
  readonly total: number;
  /** Waves that have landed so far. */
  readonly wave: number;
  /** Waves the mission sends; undefined when the edges never fall quiet. */
  readonly totalWaves: number | undefined;
  /** Living bugs on the map. */
  readonly bugsLeft: number;
  readonly status: DefendStatus;
}

// ===========================================
// Status
// ===========================================

/**
 * The live answer for a defence (#1175, GDD §5.4). Failed the moment
 * no generator is running; complete once the last wave has landed and
 * every bug on the map is dead; open otherwise. Waves are timed, not
 * gated on the last one dying, so "every wave landed" is the schedule's
 * `wave` reaching `totalWaves`, and the squad can be swarmed by three
 * waves at once if it falls behind.
 *
 * ```
 *   standing generators == 0                        ──► failed
 *   wave >= totalWaves && living bugs == 0          ──► complete
 *   else                                            ──► open
 * ```
 *
 * A schedule without `totalWaves` never completes: the mission type
 * that leaves it off is not a defence.
 */
export function defendStatus(
  mission: TacticalState,
  objective: DefendGeneratorsObjective,
): DefendStatus {
  const progress = defenceProgress(mission, objective);
  return progress.status;
}

/** The numbers behind `defendStatus`, for the tracker and the log. */
export function defenceProgress(
  mission: TacticalState,
  objective: DefendGeneratorsObjective,
): DefenceProgress {
  const targets = new Set(objective.targetIds);
  const standing = mission.units.filter(
    (unit) => targets.has(unit.id) && unit.hp > 0,
  ).length;
  const bugsLeft = mission.units.filter(
    (unit) => unit.team === "bugs" && unit.hp > 0,
  ).length;
  const { wave, totalWaves } = mission.edgeSpawn;
  const status: DefendStatus =
    standing === 0
      ? "failed"
      : totalWaves !== undefined && wave >= totalWaves && bugsLeft === 0
        ? "complete"
        : "open";
  return {
    standing,
    total: objective.targetIds.length,
    wave,
    totalWaves,
    bugsLeft,
    status,
  };
}

/** True when the objective is a defence that is done, by the live rule. */
export function objectiveComplete(
  mission: TacticalState,
  objective: Objective,
): boolean {
  return objective.kind === "defend-generators"
    ? !objective.failed && defendStatus(mission, objective) === "complete"
    : objective.complete;
}

/** True when the objective can never be completed now. */
export function objectiveFailed(
  mission: TacticalState,
  objective: Objective,
): boolean {
  return (
    objective.kind === "defend-generators" &&
    defendStatus(mission, objective) === "failed"
  );
}

// ===========================================
// Phase step
// ===========================================

/**
 * Mirrors the live status onto every defence objective's `complete` and
 * `failed` flags at each phase start, and announces the change through
 * `ObjectiveUpdated` so the log and the tracker see it (#1175). Runs
 * after the edge wave step so the wave that just landed counts. A
 * flag never goes back: a defence that failed stays failed, and one
 * that completed stays complete, since the edges are quiet by then.
 */
export function createDefenceStep(): PhaseStep {
  return (mission) => {
    const events: TacticalEvent[] = [];
    const objectives = mission.objectives.map((objective): Objective => {
      if (objective.kind !== "defend-generators") {
        return objective;
      }
      const status = defendStatus(mission, objective);
      const failed = objective.failed || status === "failed";
      // A defence that failed never completes, whatever a later phase
      // finds standing: the two flags are never both set.
      const complete = objective.complete || (!failed && status === "complete");
      if (complete === objective.complete && failed === objective.failed) {
        return objective;
      }
      events.push({
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: objective.id, complete, failed },
      });
      return { ...objective, complete, failed };
    });
    return events.length === 0
      ? { state: mission, events: [] }
      : { state: { ...mission, objectives }, events };
  };
}

/** The result type phase steps return, re-exported for step tests. */
export type DefenceStepResult = TacticalApplied<TacticalState>;
