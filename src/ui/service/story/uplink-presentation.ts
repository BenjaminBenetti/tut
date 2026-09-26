import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { STORY_RETRY_DAYS } from "../../../overworld/model/story-mission-rule";
import {
  UPLINK_SITE,
  UPLINK_WAVES,
} from "../../../overworld/service/story/uplink";
import type {
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
// Presentation
// ===========================================

/** Uplink as a story defence: the tracking array, through its waves. */
const UPLINK_DEFENCE: StoryDefence = {
  storyId: "uplink",
  site: UPLINK_SITE,
  waves: UPLINK_WAVES,
};

/**
 * Uplink (campaign arc §6.9, #1179): Act III's opener, a defence of a
 * facility the player never built. The briefing says why the array
 * matters, and the debrief whether it locked on.
 *
 * ```
 *   Briefing · Uplink
 *   The Spore Platform steers by beacons no one has found. …
 *   Objective   Hold the tracking array through 5 waves
 *   Win         The platform's beacons are revealed
 * ```
 *
 * The facility and the waves are the offer's (`Mission.defence`), which
 * the rule froze from `UPLINK_SITE` and `UPLINK_WAVES`.
 */
export const UPLINK_PRESENTATION: StoryPresentation = {
  storyId: "uplink",
  description: `The Spore Platform steers by beacons no one has found. Keep the ${siteName(UPLINK_SITE)} powered while it listens: if a generator still runs when the last wave is dead, it has them.`,
  briefingFields: [STORY_OBJECTIVE, STORY_WIN],
  briefingRows: uplinkRows,
  debriefTagline: uplinkTagline,
};

// ===========================================
// Helpers
// ===========================================

/** What holding the array takes, and what it wins. */
function uplinkRows(mission: Mission): readonly BriefingRow[] {
  return [
    holdObjectiveRow(mission, UPLINK_DEFENCE),
    { ...STORY_WIN, value: "The platform's beacons are revealed" },
  ];
}

/**
 * Uplink's debrief line: the array locked on and Platform Approach can
 * be researched, or it never did and Uplink comes back. Undefined for
 * any result that is not Uplink's (`storyDefenceEnding`).
 */
function uplinkTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
): string | undefined {
  const array = siteName(UPLINK_SITE);
  const retry = `The beacons are still dark: Uplink is pinned again in ${formatWhole(STORY_RETRY_DAYS)} days.`;
  switch (storyDefenceEnding(result, ctx, UPLINK_DEFENCE)) {
    case "won":
      return `The ${array} held through every wave and locked onto the Spore Platform's beacons. Platform Approach can now be researched.`;
    case "pulled-out":
      return `The force pulled out before the ${array} locked on. ${retry}`;
    case "fell":
      return `The ${array} fell before it locked on. ${retry}`;
    case undefined:
      return undefined;
  }
}
