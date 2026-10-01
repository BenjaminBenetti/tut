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
  ObjectiveRowCountdown,
} from "../../model/objective-presentation";
import { formatWhole } from "../format";
import { countdownText, DEADLINE_URGENT_TURNS } from "./turn-countdown";

// ===========================================
// Constants
// ===========================================

/** The row's glyph per status: held, lost, or still being defended. */
const STATUS_ICONS: Readonly<Record<DefendStatus, IconId>> = {
  complete: "check",
  failed: "warning",
  open: "defend",
};

/** `data-role` of the hold's countdown line. */
const HOLD_ROLE = "hold";

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
 * 5" is wider than the rail leaves beside a label. Once the last wave
 * is in, the hold counts down under it (#1179): the defence is held
 * when it runs out, or sooner if the bugs left are killed.
 *
 * ```
 *   ⛨ Defend the sensor array
 *     2 / 3 generators · wave 5 / 5 · 4 bugs left
 *     Hold ends in 3 turns
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
 * count, and once the last wave is in, how many bugs are left to kill
 * and how long the hold still runs. Failed reads as such, so the player
 * knows the objective is gone before the debrief. Without a reading the
 * row falls back to the stored flags and shows no numbers.
 */
function defenceRow(
  objective: DefendGeneratorsObjective,
  ctx: ObjectiveRowContext<DefenceProgress>,
): ObjectiveRow {
  const progress = ctx.progress;
  const status: DefendStatus =
    progress?.status ??
    (objective.failed ? "failed" : objective.complete ? "complete" : "open");
  const hold =
    progress === undefined || status !== "open"
      ? undefined
      : holdLine(progress.holdTurnsLeft);
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
    ...(hold === undefined ? {} : { countdowns: [hold] }),
  };
}

/**
 * The hold's countdown to the end of the turn it runs out on, worded
 * and pulsing as every countdown on the tracker does: 3 turns left
 * reads "Hold ends in 3 turns", the last "Hold ends at the end of this
 * turn". None before the hold has started or once it has run out.
 *
 * @param turnsLeft - `DefenceProgress.holdTurnsLeft`.
 */
function holdLine(
  turnsLeft: number | undefined,
): ObjectiveRowCountdown | undefined {
  if (turnsLeft === undefined || turnsLeft < 1) {
    return undefined;
  }
  return {
    text: countdownText("Hold ends", turnsLeft),
    turnsLeft,
    urgent: turnsLeft <= DEADLINE_URGENT_TURNS,
    role: HOLD_ROLE,
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
