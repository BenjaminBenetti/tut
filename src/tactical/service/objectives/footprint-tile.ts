import { manhattanDistance } from "../../../core/service/grid-math";
import type { TileCoord } from "../../../mapgen/model/tile-coord";

// ===========================================
// Footprint tile
// ===========================================

/** A thing lying across several tiles: a wreck, a tunnel mouth. */
export interface Footprint {
  /** Its middle tile, the answer when it has no tiles. */
  readonly pos: TileCoord;
  /** Every tile it covers, in hook order. */
  readonly tiles: readonly TileCoord[];
}

/**
 * The footprint tile nearest `from` by manhattan distance; the first of
 * a tie, in tile order, and `pos` when that is as near. What a unit
 * works a wide objective from: the reach the HUD measures is then the
 * reach the interaction measures.
 *
 * @param footprint - The thing's middle tile and tiles.
 * @param from - Where the unit stands.
 */
export function nearestFootprintTile(
  footprint: Footprint,
  from: TileCoord,
): TileCoord {
  let best = footprint.pos;
  let bestDistance = manhattanDistance(from, best);
  for (const tile of footprint.tiles) {
    const distance = manhattanDistance(from, tile);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}
