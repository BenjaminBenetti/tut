import type { SitrepId } from "../../content/model/sitrep-id";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { ObjectiveCountdown } from "./objective-presentation";

// ===========================================
// Sitrep deadline
// ===========================================

/**
 * A sitrep that makes something happen once a set turn has ended
 * (Dust-off Window's drop ship leaving): the words its countdown uses
 * and where the mission keeps the turn. The HUD counts it down in the
 * objective tracker and the turn banner with the objectives' own
 * deadline countdown, so both read "Drop ship leaves in 3 turns" the
 * way a pod reads "Pod matures in 3 turns".
 *
 * ```
 *   dust-off-window ──► phrase "Drop ship leaves", turn(mission) = mission.dustOffTurn
 * ```
 */
export interface SitrepDeadline {
  /** Subject and verb, as an objective's `deadlinePhrase`: "Drop ship leaves". */
  readonly phrase: string;
  /**
   * The last turn before it happens on this mission, or undefined when
   * the mission has none (a map without an extraction).
   *
   * @param mission - The mission in progress.
   */
  turn(mission: TacticalState): number | undefined;
}

/**
 * A sitrep's deadline counting down on the HUD (campaign arc §11):
 * Dust-off Window's "Drop ship leaves in 3 turns". The countdown itself
 * is built exactly as an objective's is (`countdownAt`); this adds which
 * sitrep it is and its name, for the tracker's row.
 */
export interface SitrepCountdown extends ObjectiveCountdown {
  /** The sitrep counting down. */
  readonly sitrepId: SitrepId;
  /** Its name, the row's label: "Dust-off Window". */
  readonly name: string;
}

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
  /**
   * The countdown the HUD shows while the sitrep's turn approaches.
   * Absent on a sitrep with no deadline, which is every one but
   * Dust-off Window.
   */
  readonly deadline?: SitrepDeadline;
}

/**
 * One presentation per sitrep. A `Record` over the closed `SitrepId`
 * union, so a sitrep without one is a compile error.
 */
export type SitrepPresentationCatalogue = Readonly<
  Record<SitrepId, SitrepPresentation>
>;
