import { BIOME_DEFINITIONS } from "../data/biomes";
import { MAP_SIZE_DEFINITIONS } from "../data/map-sizes";
import { PROP_DEFINITIONS } from "../data/props";
import { SETTLEMENT_DEFINITIONS } from "../data/settlements";
import { SURFACE_DEFINITIONS } from "../data/surfaces";
import type { MapGenRegistries } from "../model/registries";
import { createRegistry } from "./definition-registry";

// ===========================================
// Default registries
// ===========================================

/**
 * Builds the registries over the shipped data in `mapgen/data`. The game
 * calls this once; tests build their own registries with narrower data
 * when they need to.
 */
export function createDefaultRegistries(): MapGenRegistries {
  return {
    surfaces: createRegistry("surface", SURFACE_DEFINITIONS),
    props: createRegistry("prop", PROP_DEFINITIONS),
    biomes: createRegistry("biome", BIOME_DEFINITIONS),
    settlements: createRegistry("settlement", SETTLEMENT_DEFINITIONS),
    mapSizes: createRegistry("map size", MAP_SIZE_DEFINITIONS),
  };
}
