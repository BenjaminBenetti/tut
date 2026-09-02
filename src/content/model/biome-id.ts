// ===========================================
// Biome id
// ===========================================

/**
 * Biomes the game ships (GDD §7). Shared by overworld regions and map
 * generation so a `Mission` can carry a biome without importing `mapgen/`.
 * The full generation definitions are keyed by these ids in
 * `mapgen/data/biomes`; adding a biome is one new member here plus one
 * data entry there.
 */
export type BiomeId = "temperate" | "snowy" | "desert" | "coastal";

/** Every biome id, in a fixed order. */
export const BIOME_IDS: readonly BiomeId[] = [
  "temperate",
  "snowy",
  "desert",
  "coastal",
];
