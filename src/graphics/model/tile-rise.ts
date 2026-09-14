import type { TileCoord } from "../../mapgen/model/tile-coord";

// ===========================================
// Tile rise
// ===========================================

/**
 * How far a tile's drawn surface stands above `tileTop` (#1130): zero
 * for a ground slab whose top face lands on the plane every rule and
 * overlay measures from, and the slab's excess for a raised one such as
 * a sidewalk. Overlays add it to their lift so a mark painted on a
 * raised tile is painted on the slab rather than inside it.
 *
 * A function rather than a table because the answer is per tile: the
 * surface is the map's, the height is the art's, and only a map-aware
 * resolver can join the two.
 */
export type TileRise = (tile: TileCoord) => number;

/** No surface rises: every tile top is where `tileTop` says it is. */
export const NO_RISE: TileRise = () => 0;
