import type { TileCoord } from "../../mapgen/model/tile-coord";

// ===========================================
// TileCut
// ===========================================

/**
 * Whether the storey view hides a tile (#1134): true when the tile
 * lies above what the player has asked to see. Answered by the map
 * view, which owns the cut, and handed to the overlays so a move band
 * on a floor the cut has peeled away is not painted in mid-air over
 * the floor below it.
 *
 * ```
 *   storey 1 ─────── floor 1 ── band on floor 1 ──► cut(tile) true  ──► not drawn
 *   view     ═══════
 *   storey 0 ─────── floor 0 ── band on floor 0 ──► cut(tile) false ──► drawn
 * ```
 */
export type TileCut = (tile: TileCoord) => boolean;

/** Nothing is cut: what an uncut map and a scene-less test want. */
export const NO_CUT: TileCut = () => false;
