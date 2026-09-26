import type { ActId } from "../../content/model/act-id";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
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
 *   └── nemeses         named enemies that escaped
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
}
