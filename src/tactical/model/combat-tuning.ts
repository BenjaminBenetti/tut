import type { UnitKind } from "./unit";

import type { CoverLevel } from "../../mapgen/model/cover";
import type { WeaponReachTuning } from "./weapon-reach-tuning";

// ===========================================
// Combat tuning
// ===========================================

/**
 * Balance knobs for attacks (GDD §6.2). Services receive a tuning object
 * rather than importing the defaults, so tests and future difficulty
 * settings can substitute their own values. Defaults live in
 * `tactical/data/combat-tuning.ts`.
 *
 * ```
 *   hit% = clamp( accuracy
 *               − rangePenaltyPerTile × max(0, distance − 1)
 *               + coverModifier[cover]        (cover the target has against this attacker)
 *               + flankBonus                  (target has cover elsewhere but none here)
 *               + elevationPerStorey × levels  (attacker above: +, below: −, capped)
 *               + groundShotBonus              (aimed at a tile: no cover, no flank, and this)
 *               , minHitChance, maxHitChance )
 *
 *   damage  = roll in [damage × (1 − spread), damage × (1 + spread)]
 *           − max(0, armor − armorPen), never below minDamage
 *
 *   distance = round(hypot(manhattan, |Δy| × LAYER_TILES))   (#1119)
 *   reach    = range + min(maxReachBonus, storeysAbove × reachBonusPerStorey)
 * ```
 */
export interface CombatTuning extends WeaponReachTuning {
  /** Accuracy lost per tile of distance beyond the first. Non-negative. */
  readonly rangePenaltyPerTile: number;
  /** Accuracy change per cover level the target has against the attacker. Non-positive values. */
  readonly coverModifier: Readonly<Record<CoverLevel, number>>;
  /** Accuracy gained when the target has cover on some side but none against this attacker. Non-negative. */
  readonly flankBonus: number;
  /**
   * Accuracy gained by a shot aimed at a tile rather than a unit (#1121):
   * the ground does not move, duck or hide. Non-negative. Applied on top
   * of the ordinary formula with its cover and flank terms at zero, so a
   * mortar dropped on open ground lands more often than it misses at
   * middle range and a rifle at the same range is still the harder shot.
   */
  readonly groundShotBonus: number;
  /** Accuracy per level the attacker stands above the target (negative below). Non-negative. */
  readonly elevationPerStorey: number;
  /** Largest elevation modifier in either direction. Non-negative. */
  readonly maxElevationModifier: number;
  /** Floor and ceiling of any hit chance, in percent. `0 ≤ min ≤ max ≤ 100`. */
  readonly minHitChance: number;
  readonly maxHitChance: number;
  /** Fraction of the weapon's damage the roll may vary by, either way. In `[0, 1)`. */
  readonly damageSpread: number;
  /** Least damage a hit does after armor. Positive integer. */
  readonly minDamage: number;
  /** Action points an attack costs. Positive integer. */
  readonly attackApCost: number;
  /**
   * Whether attacking spends every remaining action point (XCOM-style),
   * per unit kind (GDD §6.2). Infantry squads are the exception: their
   * attack costs an action like any other, so a squad with two actions
   * fires twice, or moves and fires (#533). Everything else commits its
   * whole turn to the shot.
   *
   * A record rather than a flag because "how many attacks a kind gets"
   * is a budget rule, and the attack handler should not know which kind
   * it is resolving.
   */
  readonly attackEndsTurn: Readonly<Record<UnitKind, boolean>>;
}
