import type { ObjectiveRules } from "../../model/objective-rules";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type { PhaseStep } from "../../model/phase-step";
import { POD_RECOVERED } from "../../model/pod-recovered-event";
import type { TacticalEvent } from "../../model/tactical-event";
import type {
  Objective,
  RecoverPodObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";

// ===========================================
// Status
// ===========================================

/**
 * The pod `objective` keeps alive, while it is still on the map: the
 * unit, standing or destroyed, or undefined once the drop ship has
 * lifted it (or a harness never placed it).
 *
 * @param objective - The recovery to read.
 * @param mission - The mission it is in.
 */
export function recoveryPod(
  objective: RecoverPodObjective,
  mission: TacticalState,
): Unit | undefined {
  return mission.units.find((unit) => unit.id === objective.targetId);
}

/** True while the pod stands on the map with hit points left. */
function podStanding(
  objective: RecoverPodObjective,
  mission: TacticalState,
): boolean {
  const pod = recoveryPod(objective, mission);
  return pod !== undefined && pod.hp > 0;
}

/**
 * Whether the pod is recovered, live (#1179): already lifted, or its
 * recovery turn has ended with it standing, so the drop ship is lifting
 * it as this phase opens.
 *
 * ```
 *   complete flag set                          ──► true (lifted)
 *   turn > deadlineTurn and the pod standing   ──► true (lifting now)
 *   otherwise                                  ──► false
 * ```
 *
 * Reading the passed recovery turn as complete is what keeps the
 * generic deadline step off it: a deadline that passes with the pod
 * alive is the drop arriving, not the objective failing.
 *
 * @param objective - The recovery to judge.
 * @param mission - The mission it is in.
 */
export function podRecovered(
  objective: RecoverPodObjective,
  mission: TacticalState,
): boolean {
  // The deadline step's own reading of a passed deadline, restated
  // here: importing it would close a cycle through OBJECTIVE_RULES.
  return (
    objective.complete ||
    (mission.turn > objective.deadlineTurn && podStanding(objective, mission))
  );
}

/**
 * Whether the pod is lost, live (#1179): it is off the map without
 * having been lifted, or down to no hit points, before the drop.
 *
 * @param objective - The recovery to judge.
 * @param mission - The mission it is in.
 */
export function podLost(
  objective: RecoverPodObjective,
  mission: TacticalState,
): boolean {
  return !objective.complete && !podStanding(objective, mission);
}

// ===========================================
// Phase step
// ===========================================

/**
 * The recovery drop (#1179, campaign arc §6.9 Intact Pod). At each phase
 * start, every open recovery is judged live and its flags follow:
 *
 * ```
 *   podRecovered ──► the pod leaves `units` (the drop ship lifts it),
 *                    complete, recoveredHp = its hit points
 *                    PodRecovered, ObjectiveUpdated { complete: true }
 *   podLost      ──► failed
 *                    ObjectiveUpdated { failed: true }
 *   otherwise    ──► untouched
 * ```
 *
 * The recovery turn is the objective's `deadlineTurn`, so the drop comes
 * as the player phase after it opens, the same moment a missed deadline
 * would fail it. A flag never goes back, and a recovery already decided
 * is skipped, so the pod is lifted once. The step runs with the other
 * objective steps, after the edge waves; the drop only ever comes at a
 * player phase start, when no wave lands.
 *
 * @returns The step, for `EndTurn`'s list through `objectivePhaseSteps`.
 */
export function createRecoveryStep(): PhaseStep {
  return (mission) => {
    let state: TacticalState = mission;
    const events: TacticalEvent[] = [];
    for (const { id } of mission.objectives) {
      const objective = state.objectives.find(
        (candidate) => candidate.id === id,
      );
      if (
        objective?.kind !== "recover-pod" ||
        objective.complete ||
        objective.failed
      ) {
        continue;
      }
      const judged = judgeRecovery(objective, state);
      state = judged.state;
      events.push(...judged.events);
    }
    return events.length === 0
      ? { state: mission, events: [] }
      : { state, events };
  };
}

/**
 * One open recovery judged: the pod lifted, the objective failed, or
 * nothing yet.
 */
function judgeRecovery(
  objective: RecoverPodObjective,
  mission: TacticalState,
): { readonly state: TacticalState; readonly events: TacticalEvent[] } {
  const pod = recoveryPod(objective, mission);
  if (pod !== undefined && podRecovered(objective, mission)) {
    const lifted: RecoverPodObjective = {
      ...objective,
      complete: true,
      recoveredHp: pod.hp,
    };
    return {
      state: {
        ...mission,
        units: mission.units.filter((unit) => unit.id !== pod.id),
        objectives: replace(mission.objectives, lifted),
      },
      events: [
        {
          type: POD_RECOVERED,
          payload: {
            unitId: pod.id,
            objectiveId: objective.id,
            pos: pod.pos,
            hp: pod.hp,
          },
        },
        {
          type: OBJECTIVE_UPDATED,
          payload: { objectiveId: objective.id, complete: true, failed: false },
        },
      ],
    };
  }
  if (podLost(objective, mission)) {
    const lost: RecoverPodObjective = { ...objective, failed: true };
    return {
      state: { ...mission, objectives: replace(mission.objectives, lost) },
      events: [
        {
          type: OBJECTIVE_UPDATED,
          payload: { objectiveId: objective.id, complete: false, failed: true },
        },
      ],
    };
  }
  return { state: mission, events: [] };
}

/** `objectives` with the one sharing `next`'s id replaced by it. */
function replace(
  objectives: readonly Objective[],
  next: Objective,
): readonly Objective[] {
  return objectives.map((candidate) =>
    candidate.id === next.id ? next : candidate,
  );
}

// ===========================================
// Rules
// ===========================================

/**
 * `recover-pod` (#1179, campaign arc §6.9 Intact Pod): keep the spore
 * pod alive until the recovery drop. The pod is a unit of ours of kind
 * `generator`, so the swarm hunts it as it hunts a defence's generators,
 * and the objective's `huntedAt` draws a bug that sees nothing to it.
 *
 * ```
 *   complete      podRecovered, live: lifted, or the recovery turn ended with it standing
 *   failed        podLost, live: destroyed before the drop
 *   interaction   none: Interact refuses it as not interactive
 *   phaseStep     createRecoveryStep: the drop lifts the pod
 *   marker        none: the pod is ours and always in sight
 *   destination   the pod's unit id
 *   tally         1 / 1 recovered, 0 / 1 otherwise
 *   resultFields  podRecovered, podHpLeft
 * ```
 */
export const RECOVER_POD_OBJECTIVE: ObjectiveRules<"recover-pod"> = {
  kind: "recover-pod",
  /** Recovered: lifted, or the drop is due and the pod stands. */
  complete(objective, mission) {
    return podRecovered(objective, mission);
  },
  /** Lost: the pod was destroyed before the drop. */
  failed(objective, mission) {
    return podLost(objective, mission);
  },
  phaseStep: createRecoveryStep(),
  /** The pod itself, for a controller that would guard it. */
  destination(objective) {
    return { targetIds: [objective.targetId] };
  },
  /** One pod, recovered or not. */
  tally(objective, mission) {
    return { done: podRecovered(objective, mission) ? 1 : 0, total: 1 };
  },
  /**
   * Whether the drop ship lifted the pod, and its hit points: as lifted,
   * or as it stands when the mission ends before the drop (0 once
   * destroyed).
   */
  resultFields(objective, mission) {
    const pod = recoveryPod(objective, mission);
    return {
      podRecovered: podRecovered(objective, mission),
      podHpLeft: objective.recoveredHp ?? Math.max(0, pod?.hp ?? 0),
    };
  },
};
