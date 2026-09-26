// ===========================================
// Burrower tuning
// ===========================================

/**
 * Weights the burrower's choice of where to come up (#1179); a
 * substitute reshapes the ambush. Every landing is a ground tile beside
 * a target, free and standable, from which the bite would reach:
 *
 * ```
 *   score = value·valueWeight                   the bite, as a fraction of the target's hp
 *         − exposure(others)·exposureWeight     how many other enemies would see it come up
 *         − watch(all)·overwatchWeight          how many watchers cover the tile
 *         − columns·stepWeight                  how far it is from where it lies
 * ```
 *
 * The same weights price a walk-and-bite once it is up. What it costs to
 * come up and go down again is a rule, not a preference, so it lives in
 * the tactical `BurrowTuning`. See `BURROWER_TUNING`.
 */
export interface BurrowerTuning {
  /** Reward per expected fraction of the target's hit points one bite removes (`targetValue`). */
  readonly valueWeight: number;
  /** Penalty per fraction of the target's companions that can see the landing. */
  readonly exposureWeight: number;
  /** Penalty per fraction of the enemies on overwatch that cover the landing. */
  readonly overwatchWeight: number;
  /** Penalty per column (Manhattan) between the burrower and the landing. */
  readonly stepWeight: number;
}
