// ===========================================
// Burrow tuning
// ===========================================

/**
 * Balance knobs for units that move under the ground (#1179): what it
 * costs to come up and to go back down, and how long a burrower must
 * fight on the surface before it may dig again. Services receive a
 * tuning object rather than importing the defaults, so tests and future
 * difficulty settings can substitute their own. Defaults live in
 * `tactical/data/burrow-tuning.ts`.
 *
 * Moving under the ground costs what walking does — one action per
 * `move` tiles — so it has no knob of its own (`tunnel-service`).
 *
 * ```
 *   surface   1 AP   up onto the tile above; whatever is left may bite
 *   burrow    1 AP   back down, once the cooldown has run
 *   cooldown  2      turns after surfacing before it may dig again
 * ```
 */
export interface BurrowTuning {
  /** Action points coming up costs. Positive integer. */
  readonly surfaceApCost: number;
  /** Action points digging back down costs. Positive integer. */
  readonly burrowApCost: number;
  /**
   * Turns after the one it surfaced on before it may dig again: it may
   * burrow once `turn ≥ surfacedOnTurn + reburrowCooldownTurns`.
   * Non-negative integer; `0` lets it dig in the phase it came up.
   */
  readonly reburrowCooldownTurns: number;
}
