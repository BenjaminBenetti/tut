import type { ObjectiveRules } from "../../model/objective-rules";
import { SPORE_POD_MATURED } from "../../model/spore-pod-matured-event";
import type { TacticalApplied } from "../../model/tactical-event";
import type {
  DestroyPodObjective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import { plantCharges } from "./plant-charges";
import {
  wreckDestination,
  wreckMarker,
  wreckReachable,
  wreckTarget,
} from "./wreck-objectives";

// ===========================================
// Maturing
// ===========================================

/**
 * The pod tracked by `objective` matures (campaign arc §6.3): it is gone
 * — destroyed at zero hit points, so nothing can target, reach, damage
 * or draw it again and no later wreck can credit the objective — and it
 * is marked `matured` with its burst pending. The burst itself is the
 * pod burst step's (`createPodBurstStep`), which has the species and
 * the wave size this rule does not.
 *
 * ```
 *   pod standing ──► { hp: 0, destroyed, matured, burstPending }
 *                    SporePodMatured { spawnerId, objectiveId }
 *   pod gone     ──► unchanged, no events
 * ```
 *
 * @param objective - The objective whose deadline passed, already marked failed.
 * @param mission - The mission it is marked failed in; never mutated.
 * @returns The mission with the pod matured, and the event.
 */
export function maturePod(
  objective: DestroyPodObjective,
  mission: TacticalState,
): TacticalApplied<TacticalState> {
  const pod = wreckTarget(objective, mission);
  if (pod === undefined || pod.destroyed) {
    return { state: mission, events: [] };
  }
  const matured: Spawner = {
    ...pod,
    hp: 0,
    destroyed: true,
    matured: true,
    burstPending: true,
  };
  return {
    state: {
      ...mission,
      spawners: mission.spawners.map((candidate) =>
        candidate.id === pod.id ? matured : candidate,
      ),
    },
    events: [
      {
        type: SPORE_POD_MATURED,
        payload: { spawnerId: pod.id, objectiveId: objective.id },
      },
    ],
  };
}

// ===========================================
// Rules
// ===========================================

/**
 * `destroy-pod` (campaign arc §6.3): wreck the crash site's spore pod
 * before it matures. A wreck objective like `destroy-spawner` — charges,
 * gunfire, blasts and fire all count, through `damageSpawner` — with a
 * clock: the objective's `deadlineTurn` is the pod's maturity turn.
 *
 * ```
 *   complete      the flag, set when the pod is wrecked
 *   failed        the pod matured
 *   interaction   plantCharges
 *   reachable     the pod, while it stands
 *   marker        the pod's tile, while it stands with hit points
 *   destination   the pod's tile, standing or not
 *   onDeadline    maturePod: the pod is gone, its burst pending
 *   tally         1 / 1 wrecked, 0 / 1 otherwise
 *   resultFields  podDestroyed
 * ```
 *
 * A pod that matured is destroyed, so the wreck objectives'
 * completion (`spawnerObjectivesCleared`) can never reach it: the
 * missed objective stays failed, as every missed deadline does.
 */
export const DESTROY_POD_OBJECTIVE: ObjectiveRules<"destroy-pod"> = {
  kind: "destroy-pod",
  /** Done once its pod was wrecked; `damageSpawner` sets the flag. */
  complete(objective) {
    return objective.complete;
  },
  /** Lost once the pod matured: it is gone, and its wave is out. */
  failed(objective, mission) {
    return wreckTarget(objective, mission)?.matured === true;
  },
  interaction: plantCharges,
  /** The pod to plant charges on, until it is wrecked, matured or gone. */
  reachable(objective, mission) {
    return wreckReachable(objective, mission);
  },
  /** The pod's tile while it stands (#1173): location only, never its health. */
  marker(objective, mission) {
    return wreckMarker(objective, mission);
  },
  /** Where the pod is or was: its location is public intel, its health is not. */
  destination(objective, mission) {
    return wreckDestination(objective, mission);
  },
  /** The deadline passed with the pod standing: it matures. */
  onDeadline(objective, mission) {
    return maturePod(objective, mission);
  },
  /** One pod, wrecked or not. */
  tally(objective) {
    return { done: objective.complete ? 1 : 0, total: 1 };
  },
  /** Whether the squad got the pod down in time, for the crash site's consequence rule. */
  resultFields(objective) {
    return { podDestroyed: objective.complete };
  },
};
