import type { SitrepId } from "../../content/model/sitrep-id";

// ===========================================
// Sitrep definition
// ===========================================

/**
 * What the offer roll needs to know about one sitrep (campaign arc §11):
 * from which mission it can be rolled, whether it favours the player,
 * and how often it comes up against the others. What the sitrep does on
 * the map is tactical's (`SITREP_RULES`); how it reads is the UI's
 * (`SITREP_PRESENTATION`). Static content; the data lives in
 * `overworld/data/sitreps.ts`.
 *
 * ```
 *   SITREPS[id] ──► debutMission  rolled only once missionsPlayed + 1 ≥ it
 *              ├──► weight        relative share of the draw among debuted sitreps
 *              └──► helpsPlayer   two of the nine favour the player (arc §11)
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
