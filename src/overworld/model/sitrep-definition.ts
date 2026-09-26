import type { SitrepId } from "../../content/model/sitrep-id";

// ===========================================
// Sitrep definition
// ===========================================

/**
 * What the offer roll needs to know about one sitrep (campaign arc §11):
 * from which mission it can be rolled, on which missions it would do
 * anything, whether it favours the player, and how often it comes up
 * against the others. What the sitrep does on the map is tactical's
 * (`SITREP_RULES`); how it reads is the UI's (`SITREP_PRESENTATION`).
 * Static content; the data lives in `overworld/data/sitreps.ts`.
 *
 * ```
 *   SITREPS[id] ──► debutMission   rolled only once missionsPlayed + 1 ≥ it
 *              ├──► requiredHooks  rolled only on a type whose map has them
 *              ├──► weight         relative share of the draw among the eligible
 *              └──► helpsPlayer    two of the nine favour the player (arc §11)
 * ```
 */
export interface SitrepDefinition {
  readonly id: SitrepId;
  /**
   * The campaign mission number (1-based, counted over every act) from
   * which the sitrep can be rolled. An offer is made for mission
   * `missionsPlayed + 1`, so a debut of 10 first appears on offers made
   * once nine missions have been played.
   */
  readonly debutMission: number;
  /**
   * Map hook kinds, in the content vocabulary of
   * `MissionType.requiredHooks` ("egg-spawner", "edge-spawn",
   * "extraction"), that the offer's mission type must require for the
   * sitrep to act at all: Hardened Clutches needs egg spawners, Swarm
   * Tide edge waves, Dust-off Window a drop ship to leave. The roll never
   * puts a sitrep on an offer whose type lacks one, so no sitrep is ever
   * shown on a briefing where it would do nothing. Absent or empty: every
   * type.
   */
  readonly requiredHooks?: readonly string[];
  /** True when the sitrep favours the player: a reason to take the offer. */
  readonly helpsPlayer: boolean;
  /** Relative weight in the draw, `> 0`; weights need not sum to anything. */
  readonly weight: number;
}

/**
 * Every sitrep's definition, keyed by the closed `SitrepId` union; the
 * app passes `SITREPS`. The offer roll takes one of these rather than
 * importing the data.
 */
export type SitrepCatalogue = Readonly<Record<SitrepId, SitrepDefinition>>;
