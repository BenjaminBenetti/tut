import type { HiveNestTuning } from "../model/hive-nest-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default nest counts for a Hive Assault cavern: two nests in a fresh
 * hive's cavern, one more every second level, never more than four —
 * the most the brood floors hold on every seed of the cavern sweep
 * (`hive-assault-map.test.ts`). The cavern's own recipe asks for three,
 * so a level-2 or level-3 hive's cavern is the cavern as designed.
 *
 * ```
 *   level  0  1  2  3  4+
 *   nests  2  2  3  3  4
 * ```
 */
export const HIVE_NEST_TUNING: HiveNestTuning = {
  baseNests: 2,
  nestsPerLevel: 0.5,
  minNests: 2,
  maxNests: 4,
};
