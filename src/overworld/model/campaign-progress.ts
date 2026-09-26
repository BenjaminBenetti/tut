import type { ActId } from "../../content/model/act-id";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { Nemesis } from "./nemesis";

// ===========================================
// Campaign progress
// ===========================================

/**
 * How far the campaign has come (campaign arc §3–§4, ADR 0013 §2.1): the
 * act, the missions played, the story flags earned, the species killed
 * and the named enemies still out there. Part of `OverworldState`; plain
 * serializable data that every rule returns a copy of.
 *
 * ```
 *   CampaignProgress
 *   ├── act             current act; story services advance it
 *   ├── actStartedAt    missionsPlayed when the act began
 *   ├── missionsPlayed  every resolved mission ─┐
 *   ├── missionsWon     the won ones ───────────┤ counted by LaunchMission only
 *   ├── speciesKilled   first kills, in order ──┘
 *   ├── flags           story items and events; story services set them
 *   ├── nemeses         named enemies that escaped
 *   ├── storyWon?       story missions won ──────┐ the story service keeps them
 *   └── storyRetryDay?  lost ones' re-pin day ───┘ (ADR 0013 §2.5)
 * ```
 *
 * Who writes it: the launch handler (`launch-mission-service.ts`) is the
 * single place that counts missions and kills; story services change
 * `act` and `flags`. Nothing else mutates it.
 */
export interface CampaignProgress {
  /** The act being played. */
  readonly act: ActId;
  /**
   * `missionsPlayed` at the moment `act` began, so missions played in
   * this act are `missionsPlayed − actStartedAt`. Debuts count from here.
   */
  readonly actStartedAt: number;
  /** Every resolved mission: won, extracted or lost. */
  readonly missionsPlayed: number;
  /** Resolved missions whose outcome was `won`. */
  readonly missionsWon: number;
  /** Story items and events earned, in the order earned. Never holds a duplicate. */
  readonly flags: readonly CampaignFlagId[];
  /**
   * Every species the player has killed at least once, in first-kill
   * order. Never holds a duplicate. Feeds the autopsy tech nodes.
   */
  readonly speciesKilled: readonly BugSpeciesId[];
  /** Named enemies that escaped and may return. */
  readonly nemeses: readonly Nemesis[];
  /**
   * Story missions won, in the order won; never holds a duplicate. A won
   * story mission is never pinned again. Optional (ADR 0013 §2.9): absent
   * reads as none, so a save from before the story spine needs no
   * migration.
   */
  readonly storyWon?: readonly StoryMissionId[];
  /**
   * For each story mission lost under a retry rule, the first day it may
   * be pinned again (arc §4: "losing a story mission delays it five
   * days, then re-pins it"). An entry is dropped when the mission is
   * won. Optional, like `storyWon`: absent reads as no delays.
   */
  readonly storyRetryDay?: Readonly<Partial<Record<StoryMissionId, number>>>;
}
