import { STORY_MISSION_IDS } from "../../../content/model/story-mission-id";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import type { StoryPresentationCatalogue } from "../../model/story-presentation";
import { GREAT_HIVE_PRESENTATION } from "./great-hive-presentation";
import { LAUNCH_WINDOW_PRESENTATION } from "./launch-window-presentation";
import { LIVE_SPECIMEN_PRESENTATION } from "./live-specimen-presentation";
import { UPLINK_PRESENTATION } from "./uplink-presentation";

// ===========================================
// Table
// ===========================================

/**
 * How the UI shows each story mission on top of its type (ADR 0013
 * §2.5). One module per story mission that has anything to add; a new
 * one adds its module and one line here.
 *
 * ```
 *   first-skyfall  ──► (none: the crash site's presentation says it all)
 *   live-specimen  ──► live-specimen-presentation.ts
 *   uplink         ──► uplink-presentation.ts          } story defences, sharing
 *   great-hive     ──► great-hive-presentation.ts
 *   launch-window  ──► launch-window-presentation.ts   } story-defence-presentation.ts
 * ```
 */
export const STORY_PRESENTATION: StoryPresentationCatalogue = {
  "live-specimen": LIVE_SPECIMEN_PRESENTATION,
  uplink: UPLINK_PRESENTATION,
  "great-hive": GREAT_HIVE_PRESENTATION,
  "launch-window": LAUNCH_WINDOW_PRESENTATION,
};

// ===========================================
// Queries
// ===========================================

/**
 * Every field any story mission can add to the briefing, in
 * `STORY_MISSION_IDS` order, each key once: the story slots the
 * briefing builds at mount.
 *
 * @param stories - The story presentations.
 */
export function storyBriefingFieldsOf(
  stories: StoryPresentationCatalogue,
): readonly BriefingField[] {
  const seen = new Set<string>();
  const fields: BriefingField[] = [];
  for (const storyId of STORY_MISSION_IDS) {
    for (const field of stories[storyId]?.briefingFields ?? []) {
      if (!seen.has(field.field)) {
        seen.add(field.field);
        fields.push(field);
      }
    }
  }
  return fields;
}

/**
 * The story rows `mission` fills: its story's, or none for a mission
 * that is not a story mission or whose story adds nothing.
 *
 * @param mission - The offer shown.
 * @param ctx - The campaign it belongs to.
 * @param stories - The story presentations.
 */
export function storyBriefingRowsOf(
  mission: Mission,
  ctx: MissionPresentationContext,
  stories: StoryPresentationCatalogue,
): readonly BriefingRow[] {
  return mission.storyId === undefined
    ? []
    : (stories[mission.storyId]?.briefingRows(mission, ctx) ?? []);
}

/**
 * The briefing's line for `mission` in its story's words, or undefined
 * to keep the type's description.
 *
 * @param mission - The offer shown.
 * @param stories - The story presentations.
 */
export function storyDescriptionOf(
  mission: Mission,
  stories: StoryPresentationCatalogue,
): string | undefined {
  return mission.storyId === undefined
    ? undefined
    : stories[mission.storyId]?.description;
}

/**
 * The debrief's story line for `result`, or undefined to fall through to
 * the type's. Every story is asked in `STORY_MISSION_IDS` order and the
 * first answer wins, as `debriefTaglineFor` asks the types.
 *
 * ```
 *   storyDebriefTaglineFor ?? debriefTaglineFor ?? the outcome's line
 * ```
 *
 * @param result - The finished mission's result.
 * @param ctx - The campaign after the result was applied.
 * @param stories - The story presentations; the shipped table by default.
 */
export function storyDebriefTaglineFor(
  result: MissionResult,
  ctx: MissionPresentationContext,
  stories: StoryPresentationCatalogue = STORY_PRESENTATION,
): string | undefined {
  for (const storyId of STORY_MISSION_IDS) {
    const tagline = stories[storyId]?.debriefTagline?.(result, ctx);
    if (tagline !== undefined) {
      return tagline;
    }
  }
  return undefined;
}
