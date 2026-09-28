import { MISSION_TUNING } from "../../../overworld/data/mission-tuning";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { STORY_RETRY_DAYS } from "../../../overworld/model/story-mission-rule";
import { findCity } from "../../../overworld/service/earth-map-query-service";
import { INTACT_POD_TUNING } from "../../../tactical/data/intact-pod-tuning";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import type { StoryPresentation } from "../../model/story-presentation";
import { formatWhole } from "../format";

// ===========================================
// Briefing fields
// ===========================================

/** What the squad has to do. */
const OBJECTIVE: BriefingField = {
  field: "story-objective",
  label: "Objective",
};

/** What a win does to the campaign. */
const WIN: BriefingField = { field: "story-win", label: "Win" };

/** What a loss does to the campaign. */
const LOST: BriefingField = { field: "story-lost", label: "Lost" };

/** Where the pod came down, and what becomes of the landing. */
const LANDING: BriefingField = {
  field: "story-landing",
  label: "Fresh landing",
};

/**
 * The crash site's rows that would mislead here: the pod does not
 * mature, and the landing is erased by the pod's recovery, not its fall.
 */
const REPLACED_CRASH_SITE_FIELDS: readonly string[] = ["pod", "landing"];

// ===========================================
// Presentation
// ===========================================

/**
 * Intact Pod (campaign arc §6.9, #1179): Act II's ending, a crash site
 * whose pod is kept, not burned. The briefing says how long it must be
 * held and what a loss costs, and replaces the crash site's clock and
 * landing rows, which describe a pod to burn; the tech bonus row stays.
 *
 * ```
 *   Briefing · Intact Pod
 *   Pod Telemetry tracked a spore pod down in one piece. …
 *   Objective       Keep the pod alive until the recovery drop at turn 10
 *   Win             Act II ends
 *   Lost            The pod is lost; telemetry finds another in 5 days
 *   Fresh landing   Cairo · +10 now · erased once the pod is recovered
 *   Tech bonus      TP ×1.5
 * ```
 *
 * The recovery turn, the landing and the retry are the shipped content's
 * (`INTACT_POD_TUNING`, `MISSION_TUNING.crashSite`, `STORY_RETRY_DAYS`),
 * the same the rules read.
 */
export const INTACT_POD_PRESENTATION: StoryPresentation = {
  storyId: "intact-pod",
  description: `Pod Telemetry tracked a spore pod down in one piece. Hold the crater until the drop ship lifts it at the end of turn ${formatWhole(INTACT_POD_TUNING.recoveryTurn)}: the swarm will go for the pod, and it cannot move.`,
  briefingFields: [OBJECTIVE, WIN, LOST, LANDING],
  briefingRows: intactPodRows,
  replacesTypeFields: REPLACED_CRASH_SITE_FIELDS,
  debriefTagline: intactPodTagline,
};

// ===========================================
// Helpers
// ===========================================

/** The recovery, the ending, the retry, and the landing the offer records. */
function intactPodRows(
  mission: Mission,
  ctx: MissionPresentationContext,
): readonly BriefingRow[] {
  const rows: BriefingRow[] = [
    {
      ...OBJECTIVE,
      value: `Keep the pod alive until the recovery drop at turn ${formatWhole(INTACT_POD_TUNING.recoveryTurn)}`,
    },
    { ...WIN, value: "Act II ends" },
    {
      ...LOST,
      value: `The pod is lost; telemetry finds another in ${formatWhole(STORY_RETRY_DAYS)} days`,
    },
  ];
  const spec = mission.crashSite;
  if (spec !== undefined) {
    const city =
      findCity(ctx.state.overworld.map, spec.landingCityId)?.name ??
      spec.landingCityId;
    rows.push({
      ...LANDING,
      value: `${city} · +${formatWhole(MISSION_TUNING.crashSite.landingInfestation)} now · erased once the pod is recovered`,
    });
  }
  return rows;
}

/**
 * Intact Pod's debrief line, read off the result's `podRecovered` and
 * `podHpLeft`: the pod lifted and the act over (a won result, with the
 * story recorded won), or what lost it (with the story set to retry).
 * Undefined for any result without a pod to keep, including an
 * auto-resolved one, which records no objectives.
 *
 * ```
 *   won, recovered, story won        ──► lifted with N hp; Act II is over
 *   retry set, recovered             ──► lifted, but the force never got home
 *   retry set, pod at 0 hp           ──► the swarm tore it open before the drop
 *   retry set, otherwise             ──► the force pulled out before the drop
 * ```
 */
function intactPodTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
): string | undefined {
  if (result.podRecovered === undefined) {
    return undefined;
  }
  const progress = ctx.state.overworld.progress;
  if (
    result.outcome === "won" &&
    result.podRecovered &&
    progress.storyWon?.includes("intact-pod") === true
  ) {
    return `The drop ship lifted the pod with ${formatWhole(result.podHpLeft ?? 0)} hp left. The lab has an intact pod, and Act II is over.`;
  }
  if (progress.storyRetryDay?.["intact-pod"] === undefined) {
    return undefined;
  }
  const retry = `Telemetry will find another: Intact Pod is pinned again in ${formatWhole(STORY_RETRY_DAYS)} days.`;
  if (result.podRecovered) {
    return `The drop ship lifted the pod, but the force never made it home. ${retry}`;
  }
  if ((result.podHpLeft ?? 0) <= 0) {
    return `The swarm tore the pod open before the drop. ${retry}`;
  }
  return `The force pulled out before the drop, and the pod was left to the swarm. ${retry}`;
}
