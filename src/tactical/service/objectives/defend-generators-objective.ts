import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type { ObjectiveRules } from "../../model/objective-rules";
import type { PhaseStep } from "../../model/phase-step";
import type { TacticalEvent } from "../../model/tactical-event";
import type {
  DefendGeneratorsObjective,
  Objective,
  TacticalState,
} from "../../model/tactical-state";

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

// ===========================================
// Rules
// ===========================================

/**
 * `defend-generators` (#1175): hold the installation's generators
 * through every counted wave. Judged live by `defendStatus`, mirrored
 * onto the flags by its phase step, never worked by a unit, and never
 * blipped in the fog: the generators are ours and always in sight.
 *
 * ```
 *   complete / failed   defendStatus, live
 *   interaction         none: Interact refuses it as not interactive
 *   phaseStep           createDefenceStep, after the edge waves
 *   destination         the generators' unit ids
 *   tally               generators still running / generators placed
 *   resultFields        defence { installation, held }
 * ```
 */
export const DEFEND_GENERATORS_OBJECTIVE: ObjectiveRules<"defend-generators"> =
  {
    kind: "defend-generators",
    /** Held: every wave landed and the field is clear, with a generator running. */
    complete(objective, mission) {
      return defendStatus(mission, objective) === "complete";
    },
    /** Lost: no generator is running. */
    failed(objective, mission) {
      return defendStatus(mission, objective) === "failed";
    },
    phaseStep: createDefenceStep(),
    /** The generators themselves, for a controller that would guard them. */
    destination(objective) {
      return { targetIds: objective.targetIds };
    },
    /** Generators still running, of those placed. */
    tally(objective, mission) {
      const progress = defenceProgress(mission, objective);
      return { done: progress.standing, total: progress.total };
    },
    /**
     * How a defence ended: the installation and whether any of its
     * generators was still running when the mission closed.
     */
    resultFields(objective, mission) {
      return {
        defence: {
          installation: objective.installation,
          held: defendStatus(mission, objective) !== "failed",
        },
      };
    },
  };
