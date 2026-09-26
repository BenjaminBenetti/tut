import { INSTALLATION_SITES } from "../../../content/data/installation-sites";
import type {
  DefendGeneratorsObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type {
  DefenceProgress,
  DefendStatus,
} from "../../../tactical/service/defence-service";
import { defenceProgress } from "../../../tactical/service/defence-service";
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

/** The row's glyph per status: held, lost, or still being defended. */
const STATUS_ICONS: Readonly<Record<DefendStatus, IconId>> = {
  complete: "check",
  failed: "warning",
  open: "defend",
};

/** The label's verb per status. */
const STATUS_VERBS: Readonly<Record<DefendStatus, string>> = {
  complete: "Held",
  failed: "Lost",
  open: "Defend",
};

// ===========================================
// Presentation
// ===========================================

/**
 * Hold the installation's generators (#1175). Named for what it holds,
 * with its progress line under the label: "2 / 3 generators · wave 3 /
 * 5" is wider than the rail leaves beside a label.
 *
 * ```
 *   ⛨ Defend the sensor array
 *     2 / 3 generators · wave 5 / 5 · 4 bugs left
 * ```
 */
export const DEFEND_GENERATORS_PRESENTATION: ObjectivePresentation<
  "defend-generators",
  DefenceProgress
> = {
  kind: "defend-generators",
  name: installationName,
  row: defenceRow,
  progress: liveProgress,
};

// ===========================================
// Helpers
// ===========================================

/** "the sensor array": the installation the generators run. */
function installationName(objective: DefendGeneratorsObjective): string {
  return `the ${INSTALLATION_SITES[objective.installation].name.toLowerCase()}`;
}

/**
 * The live numbers from the mission. The objective's flags only mirror
 * them at phase ends, so the tracker reads these instead.
 */
function liveProgress(
  objective: DefendGeneratorsObjective,
  mission: TacticalState,
): DefenceProgress {
  return defenceProgress(mission, objective);
}

/**
 * The installation by name, generators standing over total, the wave
 * count, and once the last wave is in, how many bugs are left to kill.
 * Failed reads as such, so the player knows the objective is gone
 * before the debrief. Without a reading the row falls back to the
 * stored flags and shows no numbers.
 */
function defenceRow(
  objective: DefendGeneratorsObjective,
  ctx: ObjectiveRowContext<DefenceProgress>,
): ObjectiveRow {
  const progress = ctx.progress;
  const status: DefendStatus =
    progress?.status ??
    (objective.failed ? "failed" : objective.complete ? "complete" : "open");
  return {
    icon: STATUS_ICONS[status],
    label: `${STATUS_VERBS[status]} ${installationName(objective)}`,
    data: { status, failed: status === "failed" ? "true" : "false" },
    layout: "stacked",
    ...(progress === undefined
      ? {}
      : {
          detail: {
            text: progressText(progress, status),
            role: "defence-progress",
          },
        }),
  };
}

/** "2 / 3 generators · wave 3 / 5", with the bugs left once every wave is in. */
function progressText(progress: DefenceProgress, status: DefendStatus): string {
  const waves =
    progress.totalWaves === undefined
      ? `wave ${formatWhole(progress.wave)}`
      : `wave ${formatWhole(progress.wave)} / ${formatWhole(progress.totalWaves)}`;
  const parts = [
    `${formatWhole(progress.standing)} / ${formatWhole(progress.total)} generators`,
    waves,
  ];
  if (
    progress.totalWaves !== undefined &&
    progress.wave >= progress.totalWaves &&
    status === "open"
  ) {
    parts.push(
      `${formatWhole(progress.bugsLeft)} ${progress.bugsLeft === 1 ? "bug" : "bugs"} left`,
    );
  }
  return parts.join(" · ");
}
