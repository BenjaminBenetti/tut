import type { MapSizePreset } from "../model/map-recipe";
import type { MapSizeDefinition } from "../model/map-size-definition";

// ===========================================
// Map size definitions
// ===========================================

/** Dimensions behind each size preset (ADR 0004 §4.7), keyed by preset. */
export const MAP_SIZE_DEFINITIONS: Readonly<
  Record<MapSizePreset, MapSizeDefinition>
> = {
  small: { id: "small", width: 32, depth: 32 },
  medium: { id: "medium", width: 48, depth: 48 },
  large: { id: "large", width: 64, depth: 64 },
};
