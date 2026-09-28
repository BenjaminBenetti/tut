import type { DefenceTuning } from "../../model/defence-tuning";
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
 * The numbers the tracker shows for a defence (#1175, #1179).
 *
 * ```
 *   Defend the sensor array   2 / 3 generators · wave 5 / 5 · 4 bugs left
 *                             Hold ends in 3 turns
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
  /**
   * Turns of the hold still to go, this one included, once the last
   * wave is in: 3 on the turn three before `holdUntilTurn`, 0 from that
   * turn on. Undefined until the defence step has started the hold.
   */
  readonly holdTurnsLeft: number | undefined;
  readonly status: DefendStatus;
}

// ===========================================
// Status
// ===========================================

/**
 * The live answer for a defence (#1175, #1179, GDD §5.4). Failed the
 * moment no generator is running; complete once the last wave has
 * landed and either every bug on the map is dead or the hold that wave
 * started has run out; open otherwise. Waves are timed, not gated on
 * the last one dying, so "every wave landed" is the schedule's `wave`
 * reaching `totalWaves`, and the squad can be swarmed by three waves at
 * once if it falls behind.
 *
 * ```
 *   the step already closed it (failed or complete)            ──► as closed
 *   standing generators == 0                                   ──► failed
 *   wave >= totalWaves && (living bugs == 0
 *                          || turn >= objective.holdUntilTurn) ──► complete
 *   else                                                       ──► open
 * ```
 *
 * The hold is why a defence cannot be kept open by a bug nobody can
 * find: one boxed into a map-edge pocket, or stuck on the upper floor
 * of a far building, used to hold the mission to the turn cap. Since
 * bugs can outlive the hold, a closed defence keeps its flag: the
 * generators the bugs reach while the force goes home do not un-hold
 * it. A schedule without `totalWaves` never completes: the mission type
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
  const holdTurnsLeft =
    objective.holdUntilTurn === undefined
      ? undefined
      : Math.max(0, objective.holdUntilTurn - mission.turn);
  const lastWaveIn = totalWaves !== undefined && wave >= totalWaves;
  const live: DefendStatus =
    standing === 0
      ? "failed"
      : lastWaveIn && (bugsLeft === 0 || holdTurnsLeft === 0)
        ? "complete"
        : "open";
  // Whichever way the phase step has closed it stays: a defence held
  // through its waves and its hold is not lost to the bugs still about
  // as the force goes home, and a lost one never comes back.
  const status: DefendStatus = objective.failed
    ? "failed"
    : objective.complete
      ? "complete"
      : live;
  return {
    standing,
    total: objective.targetIds.length,
    wave,
    totalWaves,
    bugsLeft,
    holdTurnsLeft,
    status,
  };
}

/**
 * The objective with its hold started, once the last counted wave has
 * landed (#1179): `holdUntilTurn` is this turn plus `holdTurns`, written
 * once and never moved. The objective unchanged before the last wave,
 * once the hold is running, once it is closed (complete or failed), or
 * when the edges never fall quiet.
 *
 * ```
 *   open, wave >= totalWaves, no holdUntilTurn ──► holdUntilTurn ← turn + holdTurns
 *   otherwise                                 ──► as it was
 * ```
 *
 * @param objective - The defence.
 * @param mission - The mission, after this phase start's edge wave.
 * @param tuning - How long the hold lasts.
 */
export function startHold(
  objective: DefendGeneratorsObjective,
  mission: TacticalState,
  tuning: DefenceTuning,
): DefendGeneratorsObjective {
  const { wave, totalWaves } = mission.edgeSpawn;
  if (
    objective.complete ||
    objective.failed ||
    objective.holdUntilTurn !== undefined ||
    totalWaves === undefined ||
    wave < totalWaves
  ) {
    return objective;
  }
  return { ...objective, holdUntilTurn: mission.turn + tuning.holdTurns };
}

// ===========================================
// Phase step
// ===========================================

/**
 * Starts each defence's hold as its last wave lands (`startHold`), then
 * mirrors the live status onto its `complete` and `failed` flags at
 * each phase start, and announces a flag's change through
 * `ObjectiveUpdated` so the log and the tracker see it (#1175, #1179).
 * Runs after the edge wave step so the wave that just landed counts. A
 * flag never goes back: a defence that failed stays failed, and one
 * that completed stays complete, though bugs may outlive the hold and
 * reach the generators as the force goes home (`defenceProgress` reads
 * the flags first).
 *
 * ```
 *   bug phase of turn T lands the last wave ──► holdUntilTurn T + holdTurns
 *   player turn T + holdTurns opens          ──► complete, if a generator runs
 *   (the last wave gets holdTurns bug phases, T … T + holdTurns − 1)
 * ```
 *
 * @param tuning - How long a defence holds after its last wave.
 */
export function createDefenceStep(tuning: DefenceTuning): PhaseStep {
  return (mission) => {
    const events: TacticalEvent[] = [];
    let changed = false;
    const objectives = mission.objectives.map((objective): Objective => {
      if (objective.kind !== "defend-generators") {
        return objective;
      }
      const held = startHold(objective, mission, tuning);
      const status = defendStatus(mission, held);
      const failed = held.failed || status === "failed";
      // A defence that failed never completes, whatever a later phase
      // finds standing: the two flags are never both set.
      const complete = held.complete || (!failed && status === "complete");
      if (complete !== held.complete || failed !== held.failed) {
        events.push({
          type: OBJECTIVE_UPDATED,
          payload: { objectiveId: held.id, complete, failed },
        });
      } else if (held === objective) {
        return objective;
      }
      changed = true;
      return { ...held, complete, failed };
    });
    return changed
      ? { state: { ...mission, objectives }, events }
      : { state: mission, events: [] };
  };
}

// ===========================================
// Rules
// ===========================================

/**
 * `defend-generators` (#1175, #1179): hold the installation's
 * generators through every counted wave. Judged live by `defendStatus`,
 * mirrored onto the flags by its phase step, never worked by a unit,
 * and never blipped in the fog: the generators are ours and always in
 * sight.
 *
 * ```
 *   complete / failed   defendStatus, live
 *   interaction         none: Interact refuses it as not interactive
 *   phaseStep           createDefenceStep(tuning), after the edge waves
 *   destination         the generators' unit ids
 *   tally               generators still running / generators placed
 *   resultFields        defence { installation, held }
 * ```
 *
 * @param tuning - How long a defence holds after its last wave.
 */
export function createDefendGeneratorsObjective(
  tuning: DefenceTuning,
): ObjectiveRules<"defend-generators"> {
  return {
    kind: "defend-generators",
    /** Held: every wave landed and the field is clear or the hold is up, with a generator running. */
    complete(objective, mission) {
      return defendStatus(mission, objective) === "complete";
    },
    /** Lost: no generator is running. */
    failed(objective, mission) {
      return defendStatus(mission, objective) === "failed";
    },
    phaseStep: createDefenceStep(tuning),
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
}
