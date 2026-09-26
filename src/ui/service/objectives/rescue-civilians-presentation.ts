import type {
  RescueCiviliansObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type {
  RescueProgress,
  RescueStatus,
} from "../../../tactical/service/objectives/rescue-civilians-objective";
import { rescueProgress } from "../../../tactical/service/objectives/rescue-civilians-objective";
import type { IconId } from "../../data/icon-manifest";
import type {
  ObjectivePresentation,
  ObjectiveRow,
  ObjectiveRowContext,
} from "../../model/objective-presentation";
import { formatWhole } from "../format";

// ===========================================
// Constants
// ===========================================

/** The row's glyph per status: half out, beyond saving, or still to do. */
const STATUS_ICONS: Readonly<Record<RescueStatus, IconId>> = {
  complete: "check",
  failed: "warning",
  open: "extract",
};

/** The label per status. */
const STATUS_LABELS: Readonly<Record<RescueStatus, string>> = {
  complete: "Civilians rescued",
  failed: "Civilians lost",
  open: "Rescue the civilians",
};

// ===========================================
// Presentation
// ===========================================

/**
 * Free the civilian groups and walk them to the drop ship (campaign arc
 * §6.4). One row for every group, with the count under the label: how
 * many are aboard of how many, how many still wait in their buildings,
 * how many are needed, and how many are lost.
 *
 * ```
 *   ⇪ Rescue the civilians
 *     1 / 4 aboard · need 2 · 2 trapped · 1 lost
 * ```
 */
export const RESCUE_CIVILIANS_PRESENTATION: ObjectivePresentation<
  "rescue-civilians",
  RescueProgress
> = {
  kind: "rescue-civilians",
  name: civiliansName,
  row: rescueRow,
  progress: liveProgress,
};

// ===========================================
// Helpers
// ===========================================

/** "the civilians": what the rescue is for, in a sentence. */
function civiliansName(): string {
  return "the civilians";
}

/**
 * The live numbers from the mission. The objective's flags only mirror
 * them when a group boards or a phase begins, so the tracker reads
 * these instead.
 */
function liveProgress(
  objective: RescueCiviliansObjective,
  mission: TacticalState,
): RescueProgress {
  return rescueProgress(mission, objective);
}

/**
 * The rescue's state and its count. Without a reading the row falls
 * back to the stored flags and shows no numbers.
 */
function rescueRow(
  objective: RescueCiviliansObjective,
  ctx: ObjectiveRowContext<RescueProgress>,
): ObjectiveRow {
  const progress = ctx.progress;
  const status: RescueStatus =
    progress?.status ??
    (objective.failed ? "failed" : objective.complete ? "complete" : "open");
  return {
    icon: STATUS_ICONS[status],
    label: STATUS_LABELS[status],
    data: { status, failed: status === "failed" ? "true" : "false" },
    layout: "stacked",
    ...(progress === undefined
      ? {}
      : {
          detail: {
            text: rescueProgressText(progress),
            role: "rescue-progress",
          },
        }),
  };
}

/**
 * "1 / 4 aboard · need 2 · 2 trapped · 1 lost": the aboard count
 * always, the target while it is not yet met, and the trapped and lost
 * counts only when there are any.
 *
 * @param progress - The rescue's live numbers.
 * @returns The progress line under the row's label.
 */
export function rescueProgressText(progress: RescueProgress): string {
  const parts = [
    `${formatWhole(progress.rescued)} / ${formatWhole(progress.total)} aboard`,
  ];
  if (progress.status === "open") {
    parts.push(`need ${formatWhole(progress.needed)}`);
  }
  if (progress.trapped > 0) {
    parts.push(`${formatWhole(progress.trapped)} trapped`);
  }
  if (progress.lost > 0) {
    parts.push(`${formatWhole(progress.lost)} lost`);
  }
  return parts.join(" · ");
}
