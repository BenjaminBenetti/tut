import type {
  StripWreckObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type {
  StripProgress,
  StripStatus,
} from "../../../tactical/service/objectives/strip-wreck-objective";
import { stripProgress } from "../../../tactical/service/objectives/strip-wreck-objective";
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

/** The row's words per status, each built on the name "the wreck". */
const LABELS: Readonly<Record<StripStatus, string>> = {
  open: "Strip the wreck",
  stripped: "Carry the wreck's parts out",
  complete: "Recovered the wreck's parts",
  failed: "Lost the wreck's parts",
};

/** The row's glyph per status. */
const STATUS_ICONS: Readonly<Record<StripStatus, IconId>> = {
  open: "interact",
  stripped: "extract",
  complete: "check",
  failed: "warning",
};

// ===========================================
// Presentation
// ===========================================

/**
 * Strip a lost mech's wreck (arc §6.6), with the turns worked under
 * the label; once stripped, the row names the last step, since the
 * objective is not done until the parts are aboard. The briefing says
 * whose wreck it is; every label here is built on the name "the
 * wreck", so the tracker, the log and the refusals agree.
 *
 * ```
 *   ◇ Strip the wreck                in reach
 *     1 / 2 turns
 *   ⇧ Carry the wreck's parts out
 *     2 / 2 turns
 *   ✓ Recovered the wreck's parts
 * ```
 *
 * Stacked, not inline (#1179): "0 / 2 turns" and "in reach" beside the
 * label leave it less than its longest word on the rail, and the render
 * drew the turns over "Strip" with "the" and "wreck" on lines of their
 * own.
 */
export const STRIP_WRECK_PRESENTATION: ObjectivePresentation<
  "strip-wreck",
  StripProgress
> = {
  kind: "strip-wreck",
  name: wreckName,
  row: wreckRow,
  progress: liveReading,
};

// ===========================================
// Helpers
// ===========================================

/** "the wreck": what the log and refusals call it. */
function wreckName(): string {
  return "the wreck";
}

/**
 * The live reading from the mission: completion waits on the Extract
 * handler, which never touches the objective, so the stored flag cannot
 * say it and the tracker reads this instead.
 */
function liveReading(
  objective: StripWreckObjective,
  mission: TacticalState,
): StripProgress {
  return stripProgress(objective, mission);
}

/**
 * The row in the status's words, with the turns worked under it while
 * there are turns to show, and whether it reads done, so the tracker's summary
 * counts the parts home when the row says so. Without a reading it
 * falls back to the objective's own counts and flags.
 */
function wreckRow(
  objective: StripWreckObjective,
  ctx: ObjectiveRowContext<StripProgress>,
): ObjectiveRow {
  const reading = ctx.progress;
  const status = reading?.status ?? storedStatus(objective);
  const turnsWorked = reading?.turnsWorked ?? objective.turnsWorked;
  const turnsNeeded = reading?.turnsNeeded ?? objective.turnsNeeded;
  return {
    icon: STATUS_ICONS[status],
    label: LABELS[status],
    data: { targetId: objective.targetId, status },
    layout: "stacked",
    complete: status === "complete",
    ...(status === "open" || status === "stripped"
      ? {
          detail: {
            text: `${formatWhole(turnsWorked)} / ${formatWhole(turnsNeeded)} turns`,
            role: "strip-progress",
          },
        }
      : {}),
  };
}

/** What the objective's own record says, for a row with no reading. */
function storedStatus(objective: StripWreckObjective): StripStatus {
  if (objective.failed === true) {
    return "failed";
  }
  if (objective.complete) {
    return "complete";
  }
  return objective.turnsWorked >= objective.turnsNeeded ? "stripped" : "open";
}
