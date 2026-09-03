import type { MechPart, PartStats } from "../model/mech-part";
import { PART_STAT_KEYS } from "../model/mech-part";

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
 * The stats one part contributes to a mech at the given upgrade level.
 * This is the single place upgrade multipliers (#69) will apply, so every
 * aggregate goes through it; until then level 0 and any other level
 * return the catalogue stats unchanged.
 */
export function effectivePartStats(
  part: MechPart,
  upgradeLevel = 0,
): PartStats {
  void upgradeLevel;
  return part.stats;
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
