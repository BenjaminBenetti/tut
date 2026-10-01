import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import type { TileCoord } from "../../mapgen/model/tile-coord";

// ===========================================
// DrawnDropship
// ===========================================

/**
 * A drop ship the scene draws: the landing zone's, which the generator
 * reserved (`TacticalMap.dropships`), or one the scene sets beside a
 * forward extraction point (#1179), which is scenery and blocks nothing.
 */
export interface DrawnDropship {
  /** The whole aircraft, lowered ramp included (`dropshipFootprint`). */
  readonly footprint: Rect;
  /** The level of the ground it serves: the level group it hangs on. */
  readonly level: number;
  /**
   * Layers above `level` its skids sit: 0 when it has landed, more when
   * it holds just clear of a step, a slope or clutter beneath it.
   */
  readonly lift: number;
  /** Nose toward this map edge; the ramp is on the opposite side. */
  readonly facing: Direction;
  /** The tile whose vision the ship shares: its first boarding tile. */
  readonly tile: TileCoord;
  /** Every tile whose sight reveals it, when more than `tile`. */
  readonly occupiedTiles?: readonly TileCoord[];
}
