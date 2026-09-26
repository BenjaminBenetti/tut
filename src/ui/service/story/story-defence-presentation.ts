import { INSTALLATION_SITES } from "../../../content/data/installation-sites";
import type { InstallationSiteId } from "../../../content/model/installation-site-id";
import type { StoryMissionId } from "../../../content/model/story-mission-id";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import { formatWhole } from "../format";

// ===========================================
// Briefing fields
// ===========================================

/**
 * What the squad has to hold, and for how long. The same key and label
 * as Live Specimen's, so the briefing builds one slot for both.
 */
export const STORY_OBJECTIVE: BriefingField = {
  field: "story-objective",
  label: "Objective",
};

/** What a win does to the campaign; Live Specimen's key and label. */
export const STORY_WIN: BriefingField = { field: "story-win", label: "Win" };

// ===========================================
// Types
// ===========================================

/**
 * One story defence (campaign arc §6.9, #1179): the story mission, the
 * facility its offers defend, and the waves they send. The facility is
 * how its result is known, since a result carries no story id.
 */
export interface StoryDefence {
  readonly storyId: StoryMissionId;
  readonly site: InstallationSiteId;
  readonly waves: number;
}

/**
 * How a story defence ended for its story, as the debrief tells it.
 *
 * ```
 *   won         won, and the story recorded the win
 *   pulled-out  not won, a generator still running; the story will retry
 *   fell        not won, every generator down; the story will retry
 * ```
 */
export type StoryDefenceEnding = "won" | "pulled-out" | "fell";

// ===========================================
// Briefing
// ===========================================

/**
 * "Hold the tracking array through 5 waves": the facility and the waves
 * the offer froze, or the story's own for an offer that carries no
 * defence (only a hand-edited save has one).
 *
 * @param mission - The story defence's offer.
 * @param story - The story defence it belongs to.
 */
export function holdObjectiveRow(
  mission: Mission,
  story: StoryDefence,
): BriefingRow {
  const site = mission.defence?.installation ?? story.site;
  const waves = mission.defence?.waves ?? story.waves;
  return {
    ...STORY_OBJECTIVE,
    value: `Hold the ${siteName(site)} through ${formatWhole(waves)} waves`,
  };
}

/**
 * The facility as a sentence names it: "tracking array".
 *
 * @param site - The facility.
 */
export function siteName(site: InstallationSiteId): string {
  return INSTALLATION_SITES[site].name.toLowerCase();
}

// ===========================================
// Debrief
// ===========================================

/**
 * How `result` ended for `story`, or undefined when it is not that
 * story's result or the story did not act on it.
 *
 * The result is known by the facility it defended
 * (`result.defence.installation`), which no other mission defends. Only
 * a played defence records one, so an auto-resolved result is undefined
 * and the debrief keeps the outcome's line, as Live Specimen's does.
 *
 * ```
 *   defence.installation ≠ story.site         ──► undefined
 *   won,  story.storyId in storyWon           ──► won
 *   else, a retry day set for story.storyId   ──► pulled-out (held) | fell
 *   else                                      ──► undefined
 * ```
 *
 * @param result - The finished mission's result.
 * @param ctx - The campaign after the result was applied.
 * @param story - The story defence asking.
 */
export function storyDefenceEnding(
  result: MissionResult,
  ctx: MissionPresentationContext,
  story: StoryDefence,
): StoryDefenceEnding | undefined {
  const defence = result.defence;
  if (defence?.installation !== story.site) {
    return undefined;
  }
  const progress = ctx.state.overworld.progress;
  if (result.outcome === "won") {
    return progress.storyWon?.includes(story.storyId) === true
      ? "won"
      : undefined;
  }
  if (progress.storyRetryDay?.[story.storyId] === undefined) {
    return undefined;
  }
  return defence.held ? "pulled-out" : "fell";
}
