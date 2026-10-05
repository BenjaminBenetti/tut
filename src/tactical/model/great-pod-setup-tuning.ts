import type { BroodTuning } from "./brood-tuning";

// ===========================================
// Great pod setup tuning
// ===========================================

/**
 * What a great pod stands up on its map (#1238): the core sealed at its
 * middle, the clock it ripens on, and the broods asleep in its chambers.
 *
 * ```
 *   core hp        coreHp + coreHpPerDifficulty × (difficulty − 1), floored
 *   ripens         as the turn crashPodMaturityTurn(difficulty) + hullTurns ends
 *   broods         one per brood-chamber hook, sized by `broods`
 * ```
 *
 * The clock is the crash site's own (`crashPodMaturityTurn`: 8 at d1,
 * sooner on a hard landing) with the hull's turns on top, the time a
 * breach and the walk through the chambers cost, so a great pod on a
 * harder crash site ripens sooner as a spore pod does.
 */
export interface GreatPodSetupTuning {
  /** The core's hit points at difficulty 1. Positive. */
  readonly coreHp: number;
  /** Hit points the core gains per difficulty step above 1. Non-negative. */
  readonly coreHpPerDifficulty: number;
  /**
   * Turns added to the crash site's pod clock: the core ripens as turn
   * `crashPodMaturityTurn(difficulty) + hullTurns` ends. Non-negative.
   */
  readonly hullTurns: number;
  /**
   * How many bugs sleep in each chamber and what wakes them. The wake
   * zone is the chamber's, `max(minZoneRadius, round(radius × zoneShare))`;
   * what a loud action is heard from is the shipped brood tuning's
   * (`noiseRadius`), which every mission's handlers read.
   */
  readonly broods: BroodTuning;
}
