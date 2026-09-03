import type { CoverLevel } from "../../mapgen/model/cover";

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
 *               + elevationPerLevel × levels  (attacker above: +, below: −, capped)
 *               , minHitChance, maxHitChance )
 *
 *   damage  = roll in [damage × (1 − spread), damage × (1 + spread)]
 *           − max(0, armor − armorPen), never below minDamage
 * ```
 */
export interface CombatTuning {
  /** Accuracy lost per tile of distance beyond the first. Non-negative. */
  readonly rangePenaltyPerTile: number;
  /** Accuracy change per cover level the target has against the attacker. Non-positive values. */
  readonly coverModifier: Readonly<Record<CoverLevel, number>>;
  /** Accuracy gained when the target has cover on some side but none against this attacker. Non-negative. */
  readonly flankBonus: number;
  /** Accuracy per level the attacker stands above the target (negative below). Non-negative. */
  readonly elevationPerLevel: number;
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
  /** Whether attacking spends every remaining action point (XCOM-style). */
  readonly attackEndsTurn: boolean;
}
