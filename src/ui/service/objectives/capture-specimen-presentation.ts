import type {
  CaptureSpecimenObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import {
  objectiveComplete,
  objectiveFailed,
} from "../../../tactical/service/objectives/objective-status";
import {
  droppedSpecimens,
  specimenCarriers,
} from "../../../tactical/service/specimen-service";
import type { IconId } from "../../data/icon-manifest";
import type {
  ObjectivePresentation,
  ObjectiveRow,
  ObjectiveRowContext,
} from "../../model/objective-presentation";

// ===========================================
// Types
// ===========================================

/** Where a capture stands, as the tracker words it (#1179). */
export type CaptureRowStatus = "open" | "complete" | "failed";

/**
 * Where the specimen is (#1179): not caught yet, carried by a squad,
 * lying where its carrier fell, or home.
 */
export type SpecimenWhereabouts = "wild" | "carried" | "dropped" | "home";

/** The live reading the tracker shows for a capture (#1179). */
export interface CaptureProgress {
  readonly status: CaptureRowStatus;
  readonly whereabouts: SpecimenWhereabouts;
}

// ===========================================
// Constants
// ===========================================

/** The row's glyph per status: brought home, lost, or still wanted. */
const STATUS_ICONS: Readonly<Record<CaptureRowStatus, IconId>> = {
  complete: "check",
  failed: "warning",
  open: "bug",
};

/** The label's verb per status. */
const STATUS_VERBS: Readonly<Record<CaptureRowStatus, string>> = {
  complete: "Captured",
  failed: "Failed to capture",
  open: "Capture",
};

/** The detail line per whereabouts, while the capture is open. */
const WHEREABOUTS_TEXT: Readonly<Record<SpecimenWhereabouts, string>> = {
  wild: "net it at half health or less",
  carried: "carried · extract with it",
  dropped: "dropped · pick it up",
  home: "extracted",
};

// ===========================================
// Presentation
// ===========================================

/**
 * Bring a bug of the objective's species home alive (#1179, Live
 * Specimen). Named for what it wants, with a line under the label that
 * says what to do next: net one, carry it out, or pick up the one a
 * fallen carrier dropped.
 *
 * ```
 *   🐛 Capture a live lurker
 *      carried · extract with it
 * ```
 */
export const CAPTURE_SPECIMEN_PRESENTATION: ObjectivePresentation<
  "capture-specimen",
  CaptureProgress
> = {
  kind: "capture-specimen",
  name: specimenName,
  row: captureRow,
  progress: liveProgress,
};

// ===========================================
// Helpers
// ===========================================

/** "a live lurker": what the objective wants. */
function specimenName(objective: CaptureSpecimenObjective): string {
  return `a live ${objective.species}`;
}

/**
 * The live reading: the rules' own complete and failed, and where the
 * specimen is now. The objective's flags only mirror the rules at phase
 * starts, so the tracker reads these instead.
 */
function liveProgress(
  objective: CaptureSpecimenObjective,
  mission: TacticalState,
): CaptureProgress {
  const status: CaptureRowStatus = objectiveComplete(mission, objective)
    ? "complete"
    : objectiveFailed(mission, objective)
      ? "failed"
      : "open";
  return { status, whereabouts: whereabouts(objective, mission, status) };
}

/** Where the specimen is: home once complete, else carried, dropped or still loose. */
function whereabouts(
  objective: CaptureSpecimenObjective,
  mission: TacticalState,
  status: CaptureRowStatus,
): SpecimenWhereabouts {
  if (status === "complete") {
    return "home";
  }
  if (specimenCarriers(mission, objective.species).length > 0) {
    return "carried";
  }
  return droppedSpecimens(mission, objective.species).length > 0
    ? "dropped"
    : "wild";
}

/**
 * The row: the species wanted, in the tense of its status, and while it
 * is open a line saying what to do next. Without a reading the row falls
 * back to the stored flags and shows no line.
 */
function captureRow(
  objective: CaptureSpecimenObjective,
  ctx: ObjectiveRowContext<CaptureProgress>,
): ObjectiveRow {
  const progress = ctx.progress;
  const status: CaptureRowStatus =
    progress?.status ??
    (objective.failed === true
      ? "failed"
      : objective.complete
        ? "complete"
        : "open");
  return {
    icon: STATUS_ICONS[status],
    label: `${STATUS_VERBS[status]} ${specimenName(objective)}`,
    data: {
      species: objective.species,
      status,
      failed: status === "failed" ? "true" : "false",
      ...(progress === undefined ? {} : { whereabouts: progress.whereabouts }),
    },
    layout: "stacked",
    ...(progress === undefined || status !== "open"
      ? {}
      : {
          detail: {
            text: WHEREABOUTS_TEXT[progress.whereabouts],
            role: "capture-progress",
          },
        }),
  };
}
