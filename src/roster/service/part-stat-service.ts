import type { MechPart, PartStats } from "../model/mech-part";
import { PART_STAT_KEYS } from "../model/mech-part";
import type { UpgradeTuning } from "../model/upgrade-tuning";

// ===========================================
// Constants
// ===========================================

/** A stat block with every field at zero, the identity for `sumPartStats`. */
export const ZERO_PART_STATS: PartStats = {
  armor: 0,
  mobility: 0,
  heat: 0,
  power: 0,
  accuracy: 0,
  firepower: 0,
  weight: 0,
};

// ===========================================
// Effective stats
// ===========================================

/**
 * The stats one part contributes to a mech at the given upgrade level
 * (GDD §5.7). This is the single place upgrade multipliers apply, so
 * every aggregate goes through it. Each stat named in
 * `tuning.scaledStats` with a positive value is multiplied by
 * `1 + level × statMultiplierPerLevel` and rounded to a whole number;
 * every other stat is the catalogue value. The level is clamped to
 * `0..maxLevel`, so a stale save cannot over-boost a part.
 *
 * ```
 *   firepower 18, level 2, +10 %/level ──► round(18 × 1.2) = 22
 *   mobility −1  (heavy part)           ──► −1, never scaled
 * ```
 */
export function effectivePartStats(
  part: MechPart,
  upgradeLevel: number,
  tuning: UpgradeTuning,
): PartStats {
  const level = clampLevel(upgradeLevel, tuning);
  if (level === 0) {
    return part.stats;
  }
  const factor = 1 + level * tuning.statMultiplierPerLevel;
  const stats: Record<keyof PartStats, number> = { ...part.stats };
  for (const key of tuning.scaledStats) {
    if (stats[key] > 0) {
      stats[key] = Math.round(stats[key] * factor);
    }
  }
  return stats;
}

/** Sums stat blocks field by field. */
export function sumPartStats(blocks: readonly PartStats[]): PartStats {
  const total: Record<keyof PartStats, number> = { ...ZERO_PART_STATS };
  for (const block of blocks) {
    for (const key of PART_STAT_KEYS) {
      total[key] += block[key];
    }
  }
  return total;
}

// ===========================================
// Upgrade cost
// ===========================================

/**
 * Credits to raise a part from `level − 1` to `level`:
 * `round(part.cost × costMultiplierPerLevel × level)`. Level `0` costs
 * nothing.
 */
export function upgradeCost(
  part: MechPart,
  level: number,
  tuning: UpgradeTuning,
): number {
  if (level <= 0) {
    return 0;
  }
  return Math.round(part.cost * tuning.costMultiplierPerLevel * level);
}

/** Credits spent to bring a part from the catalogue to `level`: the sum of every step. */
export function cumulativeUpgradeCost(
  part: MechPart,
  level: number,
  tuning: UpgradeTuning,
): number {
  let total = 0;
  for (let step = 1; step <= clampLevel(level, tuning); step++) {
    total += upgradeCost(part, step, tuning);
  }
  return total;
}

// ===========================================
// Private Functions
// ===========================================

/** A whole level in `0..maxLevel`; non-integers round down. */
function clampLevel(level: number, tuning: UpgradeTuning): number {
  if (!Number.isFinite(level) || level <= 0) {
    return 0;
  }
  return Math.min(tuning.maxLevel, Math.floor(level));
}
