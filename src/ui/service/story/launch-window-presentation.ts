import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import {
  LAUNCH_WINDOW_SITE,
  LAUNCH_WINDOW_SLIP_DAYS,
  LAUNCH_WINDOW_WAVES,
} from "../../../overworld/service/story/launch-window";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import type { StoryPresentation } from "../../model/story-presentation";
import { formatWhole } from "../format";
import type { StoryDefence } from "./story-defence-presentation";
import {
  STORY_OBJECTIVE,
  STORY_WIN,
  holdObjectiveRow,
  siteName,
  storyDefenceEnding,
} from "./story-defence-presentation";

// ===========================================
// Briefing fields
// ===========================================

/** What a loss does to the campaign. */
const LOST: BriefingField = { field: "story-lost", label: "Lost" };

// ===========================================
// Presentation
// ===========================================

/** Launch Window as a story defence: the launch site, through its waves. */
const LAUNCH_WINDOW_DEFENCE: StoryDefence = {
  storyId: "launch-window",
  site: LAUNCH_WINDOW_SITE,
  waves: LAUNCH_WINDOW_WAVES,
};

/**
 * Launch Window (campaign arc §6.9, #1179): Act III's ending, the launch
 * site held until the assault lifts off. A loss never ends the campaign,
 * so the briefing says what one costs.
 *
 * ```
 *   Briefing · Launch Window
 *   The Great Hives are down and the approach is plotted. …
 *   Objective   Hold the launch site through 7 waves
 *   Win         The launch
 *   Lost        The launch slips 5 days
 * ```
 *
 * The facility and the waves are the offer's (`Mission.defence`); the
 * slip is the rule's `LAUNCH_WINDOW_SLIP_DAYS`.
 */
export const LAUNCH_WINDOW_PRESENTATION: StoryPresentation = {
  storyId: "launch-window",
  description: `The Great Hives are down and the approach is plotted. Hold the ${siteName(LAUNCH_WINDOW_SITE)} until the assault lifts off: while a generator runs, the launch is on.`,
  briefingFields: [STORY_OBJECTIVE, STORY_WIN, LOST],
  briefingRows: launchWindowRows,
  debriefTagline: launchWindowTagline,
};

// ===========================================
// Helpers
// ===========================================

/** What holding the pad takes, what it wins, and what losing it costs. */
function launchWindowRows(mission: Mission): readonly BriefingRow[] {
  return [
    holdObjectiveRow(mission, LAUNCH_WINDOW_DEFENCE),
    { ...STORY_WIN, value: "The launch" },
    {
      ...LOST,
      value: `The launch slips ${formatWhole(LAUNCH_WINDOW_SLIP_DAYS)} days`,
    },
  ];
}

/**
 * Launch Window's debrief line: the launch is away, or it slipped and
 * Launch Window comes back. Undefined for any result that is not Launch
 * Window's (`storyDefenceEnding`).
 */
function launchWindowTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
): string | undefined {
  const site = siteName(LAUNCH_WINDOW_SITE);
  const slip = `The window slips: Launch Window is pinned again in ${formatWhole(LAUNCH_WINDOW_SLIP_DAYS)} days.`;
  switch (storyDefenceEnding(result, ctx, LAUNCH_WINDOW_DEFENCE)) {
    case "won":
      return `The ${site} held through every wave, and the launch is away: the assault is bound for the Spore Platform.`;
    case "pulled-out":
      return `The force pulled out before the launch. ${slip}`;
    case "fell":
      return `The ${site} fell before the launch. ${slip}`;
    case undefined:
      return undefined;
  }
}
