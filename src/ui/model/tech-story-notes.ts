import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";

// ===========================================
// Tech story notes
// ===========================================

/**
 * What researching a story node opens, in plain words (#1237). The tech
 * tree's detail panel reads it as "Story: opens <opens>.", so a player
 * can see which research moves the campaign on and to where.
 *
 * ```
 *   { mission: "live-specimen", opens: "Live Specimen, the mission that ends Act I" }
 *     ──► "Story: opens Live Specimen, the mission that ends Act I."
 * ```
 */
export interface TechStoryNote {
  /**
   * The story mission the research brings to the board. The words in
   * `opens` name it; this is the id they are checked against, so a
   * renamed or re-pinned mission cannot leave the note behind.
   */
  readonly mission: StoryMissionId;
  /**
   * What the research opens, read after "Story: opens " and before a
   * full stop: the mission's title and what it is to the campaign, e.g.
   * "Live Specimen, the mission that ends Act I". No trailing stop.
   */
  readonly opens: string;
}

/**
 * The story notes, keyed by the campaign flag a node's effect sets: the
 * flag is what the story pins its mission on, so the note belongs to it
 * rather than to whichever node grants it. A flag no mission is pinned
 * on has no entry.
 */
export type TechStoryNotes = Readonly<
  Partial<Record<CampaignFlagId, TechStoryNote>>
>;
