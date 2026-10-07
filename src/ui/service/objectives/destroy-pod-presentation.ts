import type { DestroyPodObjective } from "../../../tactical/model/tactical-state";
import type {
  ObjectivePresentation,
  ObjectiveRow,
  ObjectiveRowContext,
} from "../../model/objective-presentation";
import { formatWhole } from "../format";

// ===========================================
// Presentation
// ===========================================

/**
 * Wreck the crash site's spore pod before it matures (campaign arc
 * §6.3), or a great pod's core before it ripens (#1238). There is one
 * pod to a mission, so it is "the spore pod" or "the pod's core" rather
 * than an ordinal. The countdown under the row is the tracker's generic
 * deadline line, in this kind's words.
 *
 * ```
 *   spore pod                          great pod (objective.greatPod)
 *   ○ Destroy the spore pod   40 hp    ○ Destroy the pod's core   80 hp
 *     Pod matures in 3 turns             Core ripens in 3 turns
 *   ✓ Destroyed the spore pod          ✓ Destroyed the pod's core
 *   ⚠ Too late: the spore pod matured  ⚠ Too late: the pod's core ripened
 * ```
 */
export const DESTROY_POD_PRESENTATION: ObjectivePresentation<"destroy-pod"> = {
  kind: "destroy-pod",
  name: podName,
  row: podRow,
  trackedId: podId,
  deadlinePhrase: (objective) => words(objective).deadline,
};

// ===========================================
// Words
// ===========================================

/** What the tracker and the log say about one kind of pod. */
interface PodWords {
  /** The pod in a sentence: "the spore pod". */
  readonly name: string;
  /** The past tense of its clock running out: "matured". */
  readonly ripened: string;
  /** The countdown's phrase: "Pod matures". */
  readonly deadline: string;
}

/** A crash site's spore pod (campaign arc §6.3). */
const SPORE_POD_WORDS: PodWords = {
  name: "the spore pod",
  ripened: "matured",
  deadline: "Pod matures",
};

/** A great pod's core, sealed in its hull (#1238). */
const GREAT_POD_WORDS: PodWords = {
  name: "the pod's core",
  ripened: "ripened",
  deadline: "Core ripens",
};

/** The words for the objective's pod. */
function words(objective: DestroyPodObjective): PodWords {
  return objective.greatPod === true ? GREAT_POD_WORDS : SPORE_POD_WORDS;
}

// ===========================================
// Helpers
// ===========================================

/** "the spore pod" or "the pod's core": a mission has one. */
function podName(objective: DestroyPodObjective): string {
  return words(objective).name;
}

/**
 * The row: `check` once the pod is wrecked, `warning` once it matured,
 * `egg` while it ripens, the label in the matching tense, and the hit
 * points left on a pod still standing.
 */
function podRow(
  objective: DestroyPodObjective,
  ctx: ObjectiveRowContext,
): ObjectiveRow {
  const pod = ctx.spawners.find((s) => s.id === objective.targetId);
  const matured = objective.failed === true;
  const { name, ripened } = words(objective);
  return {
    icon: objective.complete ? "check" : matured ? "warning" : "egg",
    label: objective.complete
      ? `Destroyed ${name}`
      : matured
        ? `Too late: ${name} ${ripened}`
        : `Destroy ${name}`,
    data: { targetId: objective.targetId },
    layout: "inline",
    ...(pod && !pod.destroyed
      ? { detail: { text: `${formatWhole(pod.hp)} hp` } }
      : {}),
  };
}

/** The pod's id, which `target-destroyed` carries instead of the objective's. */
function podId(objective: DestroyPodObjective): string {
  return objective.targetId;
}
