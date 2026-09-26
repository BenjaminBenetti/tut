import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { PLATFORM_FAILURE_INFESTATION } from "../../../overworld/model/story-mission-rule";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import type { StoryPresentation } from "../../model/story-presentation";
import { formatWhole } from "../format";
import { STORY_WIN } from "./story-defence-presentation";

// ===========================================
// Briefing fields
// ===========================================

/** What the first loss costs: the Earth, and the research a retry needs. */
export const PLATFORM_FIRST_LOSS: BriefingField = {
  field: "story-first-loss",
  label: "First loss",
};

/** On the retry: that there is no third. */
export const PLATFORM_LAST_CHANCE: BriefingField = {
  field: "story-last-chance",
  label: "Last chance",
};

// ===========================================
// Types
// ===========================================

/**
 * How a platform assault ended for the campaign, as the debrief tells
 * it.
 *
 * ```
 *   won     the core fell and the story recorded campaign-won
 *   failed  the first loss: platform-failed, campaign-lost not yet
 *   lost    the second loss: campaign-lost
 * ```
 */
export type PlatformEnding = "won" | "failed" | "lost";

/**
 * Where a platform assault was decided: the stage its last objective
 * belongs to. Only the last stage's objectives reach the result.
 */
export type PlatformStageReached = "hull" | "core";

// ===========================================
// Presentation
// ===========================================

/**
 * The Spore Platform (campaign arc §6.9, D1, D7, #1179): the finale.
 * The mission type's rows say what the two maps are
 * (`SPORE_PLATFORM_PRESENTATION`); these say what the campaign stakes on
 * them, and the retry says it once more.
 *
 * ```
 *   Briefing · Spore Platform, first assault
 *   Stages       Two stages: the hull, then the core. …      (the type's)
 *   Target       Destroy the platform core. …                (the type's)
 *   Win          Earth is saved
 *   First loss   +30 infestation everywhere; a second chance must be researched
 *
 *   Briefing · Spore Platform, after Last Hope (platform-failed set)
 *   Win          Earth is saved
 *   Last chance  A second loss is defeat
 * ```
 *
 * The infestation is the rule's `PLATFORM_FAILURE_INFESTATION`, the
 * same number the story applies.
 */
export const SPORE_PLATFORM_STORY_PRESENTATION: StoryPresentation = {
  storyId: "spore-platform",
  briefingFields: [STORY_WIN, PLATFORM_FIRST_LOSS, PLATFORM_LAST_CHANCE],
  briefingRows: sporePlatformStoryRows,
  debriefTagline: sporePlatformTagline,
};

// ===========================================
// Briefing
// ===========================================

/**
 * The win, then what a loss costs: the first attempt's price, or on the
 * retry (`platform-failed` already set) that a loss ends the campaign.
 *
 * @param _mission - The platform's offer; every one reads the same.
 * @param ctx - The campaign it belongs to.
 */
function sporePlatformStoryRows(
  _mission: Mission,
  ctx: MissionPresentationContext,
): readonly BriefingRow[] {
  const win: BriefingRow = { ...STORY_WIN, value: "Earth is saved" };
  if (ctx.state.overworld.progress.flags.includes("platform-failed")) {
    return [win, { ...PLATFORM_LAST_CHANCE, value: "A second loss is defeat" }];
  }
  return [
    win,
    {
      ...PLATFORM_FIRST_LOSS,
      value: `+${formatWhole(PLATFORM_FAILURE_INFESTATION)} infestation everywhere; a second chance must be researched`,
    },
  ];
}

// ===========================================
// Debrief
// ===========================================

/**
 * The stage a platform result was decided on, or undefined when the
 * result is not the platform's. A result carries no story id, so it is
 * known by its objective: the hull's `board-core` or the core's
 * `destroy-platform-core`, which no other mission sets. An auto-resolved
 * result records no objectives and is not recognised.
 *
 * @param result - The finished mission's result.
 */
export function platformStageReached(
  result: MissionResult,
): PlatformStageReached | undefined {
  const kinds = new Set(result.objectives?.map((objective) => objective.kind));
  if (kinds.has("destroy-platform-core")) return "core";
  if (kinds.has("board-core")) return "hull";
  return undefined;
}

/**
 * How `result` ended for the campaign, or undefined when it is not the
 * platform's or the story did not act on it.
 *
 * ```
 *   not the platform's (platformStageReached)    ──► undefined
 *   won,  campaign-won set                       ──► won
 *   lost, campaign-lost set                      ──► lost
 *   lost, platform-failed set                    ──► failed
 *   else                                         ──► undefined
 * ```
 *
 * @param result - The finished mission's result.
 * @param ctx - The campaign after the result was applied.
 */
export function platformEnding(
  result: MissionResult,
  ctx: MissionPresentationContext,
): PlatformEnding | undefined {
  if (platformStageReached(result) === undefined) {
    return undefined;
  }
  const flags = ctx.state.overworld.progress.flags;
  if (result.outcome === "won") {
    return flags.includes("campaign-won") ? "won" : undefined;
  }
  if (flags.includes("campaign-lost")) return "lost";
  if (flags.includes("platform-failed")) return "failed";
  return undefined;
}

/**
 * The platform's debrief line: Earth saved, the first failure and what
 * it cost, or the last. A loss says where the assault broke.
 *
 * @param result - The finished mission's result.
 * @param ctx - The campaign after the result was applied.
 */
function sporePlatformTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
): string | undefined {
  const where =
    platformStageReached(result) === "core" ? "in the core" : "on the hull";
  switch (platformEnding(result, ctx)) {
    case "won":
      return "The platform core is destroyed and the Spore Platform falls silent. Earth is saved.";
    case "failed":
      return `The assault broke ${where}. The platform seeds the Earth: +${formatWhole(PLATFORM_FAILURE_INFESTATION)} infestation in every city. Research Last Hope for a second assault.`;
    case "lost":
      return `The second assault broke ${where}. There is no third: the Earth is lost.`;
    case undefined:
      return undefined;
  }
}
