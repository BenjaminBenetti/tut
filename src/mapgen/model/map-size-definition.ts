import type { MapDimensions, MapSizePreset } from "./map-recipe";

// ===========================================
// Map size definition
// ===========================================

/** Concrete dimensions behind a size preset. */
export interface MapSizeDefinition extends MapDimensions {
  readonly id: MapSizePreset;
}

/** Smallest map the generator accepts; deploy and edge zones need room. */
export const MIN_MAP_DIMENSION = 16;

/** Largest map the generator accepts; keeps the sparse tile list sane. */
export const MAX_MAP_DIMENSION = 256;
