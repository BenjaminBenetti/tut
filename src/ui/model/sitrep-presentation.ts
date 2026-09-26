import type { SitrepId } from "../../content/model/sitrep-id";

// ===========================================
// Sitrep presentation
// ===========================================

/**
 * How the UI shows one sitrep (campaign arc §11): the name on its tag,
 * the one line the briefing prints under it, and which side it favours,
 * which sets the tag's colour and its text marker.
 *
 * ```
 *   [NIGHTFALL]     HAZARD      Sight −4 for both sides.
 *   [LOCAL GUIDES]  HELPS YOU   The map starts explored; bugs stay hidden.
 * ```
 */
export interface SitrepPresentation {
  /** The tag's text, e.g. "City Ablaze". */
  readonly name: string;
  /** One line on what it does, read on the briefing under the name. */
  readonly effect: string;
  /**
   * True when it favours the player (Salvage Rich, Local Guides): the tag
   * takes the theme's "ok" colour and the "helps you" marker. Agrees with
   * the overworld's `SitrepDefinition.helpsPlayer`, which a test pins.
   */
  readonly helpsPlayer: boolean;
}

/**
 * One presentation per sitrep. A `Record` over the closed `SitrepId`
 * union, so a sitrep without one is a compile error.
 */
export type SitrepPresentationCatalogue = Readonly<
  Record<SitrepId, SitrepPresentation>
>;
