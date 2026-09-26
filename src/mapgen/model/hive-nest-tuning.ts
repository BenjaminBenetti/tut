// ===========================================
// Hive nest tuning
// ===========================================

/**
 * How many egg spawners — the hive's nests — a Hive Assault's cavern
 * holds at a hive level (campaign arc §6.5: the hive grows harder every
 * week). The count replaces the cavern's own egg-spawner request, so the
 * nests are always placed by the cavern's brood-floor placer:
 *
 * ```
 *   nests = clamp(baseNests + floor(nestsPerLevel × level), minNests, maxNests)
 * ```
 *
 * Defaults live in `mapgen/data/hive-nest-tuning.ts`.
 */
export interface HiveNestTuning {
  /** Nests in the cavern of a level-0 hive. */
  readonly baseNests: number;
  /** Extra nests per hive level, floored; fractional allowed. */
  readonly nestsPerLevel: number;
  /** Fewest nests any cavern holds. */
  readonly minNests: number;
  /** Most nests any cavern holds; the brood floors fit this many on every seed. */
  readonly maxNests: number;
}
