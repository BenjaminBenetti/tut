import type { Tile } from "../../mapgen/model/tile";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { stepGridPos } from "../../core/service/grid-math";

/**
 * Rise in layers to the high neighbour named by the existing slope metadata.
 * Shared by placeholder and loaded art; accommodates the two-layer terrain
 * emitted before #808 as well as its one-layer steps. Does not choose a shape.
 */
export function terrainSlopeRise(tile: Tile, index: TileIndex): number {
  const slope = tile.slope;
  if (slope === undefined) return 1;
  const highSides = ["s", "w", "n", "e"] as const;
  let highColumn = stepGridPos(tile, highSides[slope.turns]);
  if (slope.kind === "outer") {
    highColumn = stepGridPos(
      highColumn,
      highSides[(slope.turns + 1) % 4] ?? "s",
    );
  }
  const upper = index.column(highColumn.x, highColumn.z)[0];
  return upper !== undefined && upper.y > tile.y ? upper.y - tile.y : 1;
}
