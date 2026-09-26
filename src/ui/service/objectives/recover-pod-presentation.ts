import type {
  RecoverPodObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import { recoveryPod } from "../../../tactical/service/objectives/recover-pod-objective";
import type { IconId } from "../../data/icon-manifest";
import type {
  ObjectivePresentation,
  ObjectiveRow,
  ObjectiveRowContext,
} from "../../model/objective-presentation";
import { formatWhole } from "../format";

// ===========================================
// Types
// ===========================================

/** The pod's hit points as the HUD last read them (#1179). */
export interface PodReading {
  readonly hp: number;
  readonly maxHp: number;
}

/** Where a recovery stands, for the row's glyph and words. */
type RecoveryStatus = "open" | "recovered" | "lost";

// ===========================================
// Constants
// ===========================================

/** The row's glyph per status. */
const STATUS_ICONS: Readonly<Record<RecoveryStatus, IconId>> = {
  open: "pod",
  recovered: "check",
  lost: "warning",
};

/** The row's words per status. */
const STATUS_LABELS: Readonly<Record<RecoveryStatus, string>> = {
  open: "Keep the spore pod alive",
  recovered: "Recovered the spore pod",
  lost: "Lost the spore pod",
};

// ===========================================
// Presentation
// ===========================================

/**
 * Keep the spore pod alive until the recovery drop (#1179, campaign arc
 * §6.9 Intact Pod). One pod to a mission, so it is "the spore pod". The
 * pod's hit points sit under the label, read live from the mission, and
 * the countdown under them is the tracker's generic deadline line in
 * this kind's words.
 *
 * ```
 *   ◉ Keep the spore pod alive
 *     48 / 65 hp
 *     Recovery in 3 turns
 *   ✓ Recovered the spore pod
 *   ⚠ Lost the spore pod
 * ```
 */
export const RECOVER_POD_PRESENTATION: ObjectivePresentation<
  "recover-pod",
  PodReading | undefined
> = {
  kind: "recover-pod",
  name: podName,
  row: recoveryRow,
  progress: podReading,
  trackedId: podId,
  deadlinePhrase: () => "Recovery",
};

// ===========================================
// Helpers
// ===========================================

/** "the spore pod": Intact Pod has one. */
function podName(): string {
  return "the spore pod";
}

/**
 * The pod's hit points now, or undefined once the drop ship has lifted
 * it. The objective only mirrors the pod at phase ends, so the tracker
 * reads the unit afresh.
 */
function podReading(
  objective: RecoverPodObjective,
  mission: TacticalState,
): PodReading | undefined {
  const pod = recoveryPod(objective, mission);
  return pod === undefined
    ? undefined
    : { hp: Math.max(0, pod.hp), maxHp: pod.maxHp };
}

/**
 * The row: the pod glyph while it must be kept alive, `check` once it is
 * lifted, `warning` once it is lost, and the hit points left while it
 * stands. A reading at no hit points is a loss the phase step has not
 * yet recorded, so the row says so at once.
 */
function recoveryRow(
  objective: RecoverPodObjective,
  ctx: ObjectiveRowContext<PodReading | undefined>,
): ObjectiveRow {
  const reading = ctx.progress;
  const status: RecoveryStatus = objective.complete
    ? "recovered"
    : objective.failed || reading?.hp === 0
      ? "lost"
      : "open";
  return {
    icon: STATUS_ICONS[status],
    label: STATUS_LABELS[status],
    data: { targetId: objective.targetId, status },
    layout: "stacked",
    ...(status === "open" && reading !== undefined
      ? {
          detail: {
            text: `${formatWhole(reading.hp)} / ${formatWhole(reading.maxHp)} hp`,
            role: "pod-hp",
          },
        }
      : {}),
  };
}

/** The pod's unit id. */
function podId(objective: RecoverPodObjective): string {
  return objective.targetId;
}
