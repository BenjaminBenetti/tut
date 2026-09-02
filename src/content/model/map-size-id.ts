// ===========================================
// Map size id
// ===========================================

/**
 * Named tactical map sizes (ADR 0004 §4.7). Shared vocabulary: the
 * overworld's `Mission` asks for a size by this id and map generation
 * resolves it to tiles in `mapgen/data/map-sizes`, keyed by this union so
 * a new size without dimensions fails to compile.
 */
export type MapSizeId = "small" | "medium" | "large";

/** Every map size id, smallest first. */
export const MAP_SIZE_IDS: readonly MapSizeId[] = ["small", "medium", "large"];
