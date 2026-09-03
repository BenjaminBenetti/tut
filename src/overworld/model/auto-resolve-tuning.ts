import type { MissionOutcome } from "./mission-result";

// ===========================================
// Building blocks
// ===========================================

/** One value per mission outcome. */
export type PerOutcome<T> = Readonly<Record<MissionOutcome, T>>;

/** Inclusive integer range of damage a mech can take. */
export interface DamageRange {
  readonly min: number;
  readonly max: number;
}

// ===========================================
// Tuning
// ===========================================

/**
 * Balance knobs for the M1 auto-resolver (GDD §4). Services receive a
 * tuning object rather than importing the defaults, so tests and future
 * difficulty settings can substitute their own values. Defaults live in
 * `overworld/data/auto-resolve-tuning.ts`.
 *
 * ```
 *   force   = Σ squad.combatRating × strength / maxStrength
 *           + Σ mechRating × (1 − damage / 100 × damagePenalty)
 *
 *   P(win)  = 1 / (1 + e^−((force − difficulty × difficultyScale) / winSpread))
 *
 *   outcome = win roll ──yes──► won
 *                      └─no──► extract roll ──yes──► extracted
 *                                            └─no──► lost
 *
 *   per soldier:  lost with P = casualtyChance[outcome]
 *   per mech:     destroyed with P = mechDestructionChance[outcome],
 *                 else damage in mechDamage[outcome]
 * ```
 */
export interface AutoResolveTuning {
  /**
   * Force rating one point of difficulty is worth: at `force ===
   * difficulty × difficultyScale` the fight is even. Positive.
   */
  readonly difficultyScale: number;
  /**
   * Force-rating gap that moves the win chance from even to about 73%.
   * Smaller is swingier. Positive.
   */
  readonly winSpread: number;
  /**
   * How much accumulated damage weakens a mech: at `1` a mech at maximum
   * damage counts for nothing; at `0` damage is ignored. In `[0, 1]`.
   */
  readonly damagePenalty: number;
  /** Probability in `[0, 1]` that a failed mission ends in extraction rather than a loss. */
  readonly extractChance: number;
  /** Probability in `[0, 1]` that each deployed soldier is lost, per outcome. */
  readonly casualtyChance: PerOutcome<number>;
  /** Probability in `[0, 1]` that each deployed mech is destroyed outright, per outcome. */
  readonly mechDestructionChance: PerOutcome<number>;
  /** Damage a surviving mech takes, per outcome. Whole, non-negative, `min <= max`. */
  readonly mechDamage: PerOutcome<DamageRange>;
  /** Fraction in `[0, 1]` of the mission's credits paid on extraction. Nothing is paid on a loss. */
  readonly extractedRewardFraction: number;
  /** Infestation removed from the host city on a win at difficulty 0. Non-negative. */
  readonly clearanceBase: number;
  /** Extra infestation removed per point of difficulty on a win. Non-negative. */
  readonly clearancePerDifficulty: number;
  /** Infestation added to the host city on a loss. Non-negative. */
  readonly lossInfestationPenalty: number;
}
