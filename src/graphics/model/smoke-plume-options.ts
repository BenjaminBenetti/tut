// ===========================================
// Smoke plume options
// ===========================================

/**
 * How a plume of smoke breathes (#1130, #1132). A plume is a handful of
 * soft puffs on one loop, each on its own phase of it: born at
 * `startHeight`, rising `rise` over `period` seconds while swelling from
 * `baseScale` by `growth`, fading in over the first quarter of the loop
 * and out over the rest, wandering `drift` sideways as it goes.
 *
 * ```
 *   t = 0            t = 0.5              t = 1
 *   · (baseScale)    ○ (rising, peak)     ◯ (baseScale + growth, gone)
 *   startHeight      + rise / 2           + rise
 * ```
 *
 * Presets live in `graphics/data/smoke-plumes.ts`: the burnt-out radar's
 * and the fire's differ in colour, size and where they start.
 */
export interface SmokePlumeOptions {
  /** Puffs on the loop. Positive integer. */
  readonly puffs: number;
  /** Puff colour as a hex triplet. */
  readonly colour: number;
  /** A puff's size at birth, in world units. Positive. */
  readonly baseScale: number;
  /** How much a puff swells by the end of its loop, in world units. Non-negative. */
  readonly growth: number;
  /** Where a puff is born, above the plume's origin, in world units. */
  readonly startHeight: number;
  /** How far a puff rises over its loop, in world units. Non-negative. */
  readonly rise: number;
  /** Seconds one puff takes from birth to gone. Positive. */
  readonly period: number;
  /** Peak opacity of a puff, in `[0, 1]`. */
  readonly peakOpacity: number;
  /** Sideways wander of a rising puff, in world units. Non-negative. */
  readonly drift: number;
}
