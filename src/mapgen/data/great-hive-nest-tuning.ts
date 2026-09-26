import type { HiveNestTuning } from "../model/hive-nest-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Nests in a Great Hive's cavern: three at level 0, one more for every
 * two levels lost assaults add, up to five — one more than an ordinary
 * hive's floor and ceiling.
 */
export const GREAT_HIVE_NEST_TUNING: HiveNestTuning = {
  baseNests: 3,
  nestsPerLevel: 0.5,
  minNests: 3,
  maxNests: 5,
};
