// ===========================================
// Spray puff options
// ===========================================

/**
 * How a spray of puffs drifts out of a nozzle on the strategic map
 * (#1155). A handful of tiny translucent sprites on one loop, each on
 * its own phase: born at the nozzle's mouth, carried `reach` along the
 * nozzle's local `+z` over `period` seconds while swelling from
 * `baseScale` by `growth`, fading in over the first quarter of the loop
 * and out over the rest. Movement is along the ground plane on purpose:
 * the map is seen straight down, so a puff that only rose would not
 * appear to move at all.
 *
 * ```
 *   nozzle ▶ ·  ·   ○    ◯       (local +z, on the ground plane)
 *          t=0            t=1
 * ```
 */
export interface SprayPuffOptions {
  /** Puffs on the loop. Positive integer. */
  readonly puffs: number;
  /** Puff colour as a hex triplet. */
  readonly colour: number;
  /** A puff's size at birth, in world units. Positive. */
  readonly baseScale: number;
  /** How much a puff swells by the end of its loop, in world units. Non-negative. */
  readonly growth: number;
  /** Where a puff is born: along the nozzle's local `+z` and above its origin, in world units. */
  readonly mouth: { readonly forward: number; readonly height: number };
  /** How far a puff travels along local `+z` over its loop, in world units. Non-negative. */
  readonly reach: number;
  /** Seconds one puff takes from birth to gone. Positive. */
  readonly period: number;
  /** Peak opacity of a puff, in `[0, 1]`. */
  readonly peakOpacity: number;
}
