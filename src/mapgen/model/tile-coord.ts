import type { GridPos } from "../../core/model/grid";

// ===========================================
// Tile coordinate
// ===========================================

/**
 * Integer position of a tile: `x` east, `z` south, `y` the vertical level
 * index (one level is roughly one storey). Alias of core's `GridPos` per
 * ADR 0004 §4.1; mapgen names it for readability only. Helpers such as
 * `stepGridPos`, `manhattanDistance` and `gridKey` live in
 * `core/service/grid-math`.
 */
export type TileCoord = GridPos;
