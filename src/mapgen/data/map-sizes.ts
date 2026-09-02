import type { MapSizeDefinition } from "../model/map-size-definition";

// ===========================================
// Map size definitions
// ===========================================

/** Dimensions behind each size preset (ADR 0004 §4.7). */
export const MAP_SIZE_DEFINITIONS: readonly MapSizeDefinition[] = [
  { id: "small", width: 32, depth: 32 },
  { id: "medium", width: 48, depth: 48 },
  { id: "large", width: 64, depth: 64 },
];
