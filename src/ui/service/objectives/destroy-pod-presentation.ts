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
 * §6.3). There is one pod to a crash site, so it is "the spore pod"
 * rather than an ordinal. The countdown under the row is the tracker's
 * generic deadline line, in this kind's words.
 *
 * ```
 *   ○ Destroy the spore pod         40 hp
 *     Pod matures in 3 turns
 *   ✓ Destroyed the spore pod
 *   ⚠ Too late: the spore pod matured
 * ```
 */
export const DESTROY_POD_PRESENTATION: ObjectivePresentation<"destroy-pod"> = {
  kind: "destroy-pod",
  name: podName,
  row: podRow,
  trackedId: podId,
  deadlinePhrase: () => "Pod matures",
};

// ===========================================
// Helpers
// ===========================================

/** "the spore pod": a crash site has one. */
function podName(): string {
  return "the spore pod";
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
  return {
    icon: objective.complete ? "check" : matured ? "warning" : "egg",
    label: objective.complete
      ? "Destroyed the spore pod"
      : matured
        ? "Too late: the spore pod matured"
        : "Destroy the spore pod",
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
