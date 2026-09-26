import { BUG_SPECIES } from "../../../bugs/data/species";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { STORY_RETRY_DAYS } from "../../../overworld/model/story-mission-rule";
import { CAPTURE_NET } from "../../../tactical/data/equipment";
import { LIVE_SPECIMEN_SPECIES } from "../../../tactical/service/story/live-specimen-setup";
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

/** What the squads carry for it. */
const KIT: BriefingField = { field: "story-kit", label: "Kit" };

// ===========================================
// Presentation
// ===========================================

/**
 * Live Specimen (campaign arc §6.9, #1179): Act I's ending, a clearance
 * whose nests no longer decide it. The briefing says what does, and the
 * debrief says whether the specimen came home.
 *
 * ```
 *   Briefing · Live Specimen
 *   The lab needs a lurker alive. …
 *   Objective   Net a lurker at 50% HP or less, then bring it home
 *   Win         Act I ends
 *   Kit         Every squad carries a capture net
 * ```
 *
 * The species, the threshold and the retry are the shipped content's
 * (`LIVE_SPECIMEN_SPECIES`, `CAPTURE_NET.net`, `STORY_RETRY_DAYS`), the
 * same the rules read.
 */
export const LIVE_SPECIMEN_PRESENTATION: StoryPresentation = {
  storyId: "live-specimen",
  description: `The lab needs a ${specimenName()} alive. Wear one down, net it and carry it to the drop ship. The nests here are optional: only the specimen wins the mission.`,
  briefingFields: [OBJECTIVE, WIN, KIT],
  briefingRows: liveSpecimenRows,
  debriefTagline: liveSpecimenTagline,
};

// ===========================================
// Helpers
// ===========================================

/** The three rows, the same on every Live Specimen offer. */
function liveSpecimenRows(): readonly BriefingRow[] {
  const threshold = CAPTURE_NET.net?.captureAtHpFraction ?? 0;
  return [
    {
      ...OBJECTIVE,
      value: `Net a ${specimenName()} at ${formatWhole(threshold * 100)}% HP or less, then bring it home`,
    },
    { ...WIN, value: "Act I ends" },
    { ...KIT, value: "Every squad carries a capture net" },
  ];
}

/**
 * Live Specimen's debrief line: the specimen brought home (a won result
 * carrying the species, with the story recorded won), or not (a result
 * with a capture objective left undone, with the story set to retry).
 * Undefined for anything else, including an auto-resolved result, which
 * records no objectives.
 */
function liveSpecimenTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
): string | undefined {
  const progress = ctx.state.overworld.progress;
  const name = specimenName();
  if (
    result.outcome === "won" &&
    result.specimenCaptured === LIVE_SPECIMEN_SPECIES &&
    progress.storyWon?.includes("live-specimen") === true
  ) {
    return `The ${name} is home alive, in the net. The lab has its live specimen, and Act I is over.`;
  }
  const missed = result.objectives?.some(
    (objective) => objective.kind === "capture-specimen" && !objective.complete,
  );
  if (
    missed === true &&
    progress.storyRetryDay?.["live-specimen"] !== undefined
  ) {
    return `No ${name} came home alive. The lab is still waiting: the hunt is pinned again in ${formatWhole(STORY_RETRY_DAYS)} days.`;
  }
  return undefined;
}

/** The specimen's species as a sentence names it: "lurker". */
function specimenName(): string {
  return BUG_SPECIES[LIVE_SPECIMEN_SPECIES].name.toLowerCase();
}
