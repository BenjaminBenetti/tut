import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { Mission } from "../../overworld/model/mission";
import type { MissionResult } from "../../overworld/model/mission-result";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentationContext,
} from "./mission-presentation";

// ===========================================
// Story presentation
// ===========================================

/**
 * How the UI shows one story mission on top of its type (ADR 0013
 * §2.5, #1179). A story offer keeps its type's `typeId`, so the type's
 * `MissionPresentation` still draws its glyph and its rows; the story
 * adds what only it has, and may say the briefing's line and the
 * debrief's in its own words.
 *
 * ```
 *   STORY_PRESENTATION[storyId]
 *     ├ description     ──► the briefing's line, instead of the type's
 *     ├ briefingFields  ──► story slots, built once at mount
 *     ├ briefingRows    ──► the slots this mission fills; the rest hide
 *     └ debriefTagline  ──► results banner line, asked before the type's
 * ```
 *
 * The title ("Live Specimen") is not here: it is `STORY_MISSION_TITLES`,
 * which every story mission has from the day its id exists.
 */
export interface StoryPresentation {
  /** The story mission this entry presents; equal to its key in the table. */
  readonly storyId: StoryMissionId;
  /**
   * The briefing's line under the heading, in place of the mission
   * type's description; the type's own when left out.
   */
  readonly description?: string;
  /**
   * Every row `briefingRows` can return, in grid order, so the briefing
   * builds its slots once and only rewrites values afterwards. Keys must
   * not repeat a mission type's.
   */
  readonly briefingFields: readonly BriefingField[];
  /**
   * The rows this mission fills, a subset of `briefingFields` in the
   * same order.
   */
  briefingRows(
    mission: Mission,
    ctx: MissionPresentationContext,
  ): readonly BriefingRow[];
  /**
   * The debrief's line for `result` in this story's words, or undefined
   * to fall through to the type's and then the outcome's. A result
   * carries neither a type nor a story id, so the tagline reads its own
   * payload and answers undefined for a result that is not its story's.
   */
  debriefTagline?(
    result: MissionResult,
    ctx: MissionPresentationContext,
  ): string | undefined;
}

/**
 * The presentation of each story mission that has one, keyed by id; the
 * shipped one is `STORY_PRESENTATION`. `Partial`: a story mission whose
 * type says everything (First Skyfall is a crash site) needs none.
 */
export type StoryPresentationCatalogue = Readonly<
  Partial<Record<StoryMissionId, StoryPresentation>>
>;
