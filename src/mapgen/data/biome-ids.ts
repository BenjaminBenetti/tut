// ===========================================
// Biome ids
// ===========================================

/**
 * Ids of the biomes M1.5 ships (GDD §7). The full definitions live in
 * `mapgen/data/biomes`; this file exists so prop and surface data can name
 * biomes without importing the definitions.
 */
export const BiomeIds = {
  TEMPERATE: "temperate",
  SNOWY: "snowy",
  DESERT: "desert",
  COASTAL: "coastal",
} as const;

/** One of the shipped biome ids. */
export type KnownBiomeId = (typeof BiomeIds)[keyof typeof BiomeIds];

/** Every shipped biome id, in a fixed order. */
export const KNOWN_BIOME_IDS: readonly KnownBiomeId[] = [
  BiomeIds.TEMPERATE,
  BiomeIds.SNOWY,
  BiomeIds.DESERT,
  BiomeIds.COASTAL,
];
