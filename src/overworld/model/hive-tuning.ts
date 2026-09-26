import type { ActId } from "../../content/model/act-id";

// ===========================================
// Hive tuning
// ===========================================

/**
 * Balance knobs for bug hives on the strategic map (campaign arc §3
 * Act II, §6.5). Services receive a tuning object rather than importing
 * the defaults, so tests and later difficulty settings can substitute
 * their own values. Defaults live in `overworld/data/hive-tuning.ts`.
 *
 * ```
 *   formation   region mean ≥ formationThreshold for formationDays days in a row
 *               (from act formsFromAct on)                 ──► a hive forms
 *   level       floor((day − formedDay) / difficultyStepDays)  0, 1, 2 …
 *   liberation  hive removed; its region's cities − liberationCut;
 *               the region neither grows nor spreads for liberationGrowthPauseDays days
 * ```
 *
 * The faster spread a hive brings is `InfestationTuning.hiveSpreadMultiplier`,
 * because the spread service is what reads it.
 */
export interface HiveTuning {
  /**
   * Mean region infestation at or above which a day counts toward a
   * hive forming. In the city infestation range.
   */
  readonly formationThreshold: number;
  /**
   * Consecutive days a region's mean must hold at or above
   * `formationThreshold` before a hive forms there. A day below resets
   * the count. Positive integer.
   */
  readonly formationDays: number;
  /**
   * Days between a hive's difficulty steps: its level is 0 when it
   * forms and gains one every `difficultyStepDays`. Positive integer.
   */
  readonly difficultyStepDays: number;
  /**
   * Infestation removed from every city of a liberated region, before
   * clamping at zero. Non-negative integer.
   */
  readonly liberationCut: number;
  /**
   * Days a liberated region neither grows nor spreads, counted from the
   * day after liberation. Non-negative integer.
   */
  readonly liberationGrowthPauseDays: number;
  /**
   * The first act in which hives form on their own. Before it the
   * formation step does nothing at all, not even count days.
   */
  readonly formsFromAct: ActId;
}
