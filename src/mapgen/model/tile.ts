import type { CoverLevel } from "./cover";
import type { PassMask } from "./pass-mask";
import type { Slope } from "./slope";
import type { SurfaceId } from "./surface";
import type { TileCoord } from "./tile-coord";
import type { WallSet } from "./wall";

// ===========================================
// Tile
// ===========================================

/**
 * One standable surface in the map (ADR 0004 §4.2). Tiles are sparse: air
 * and solid rock have no record. Ground, building floors, stair tiles and
 * walkable roofs all appear here on the same level axis.
 *
 * ```
 *   y=4   [roof ][roof ]
 *   y=2   [floor][floor]            ← building tiles carry buildingId
 *   y=0   [grass][floor][road]      ← ground and floor 0 share a level
 * ```
 */
export interface Tile extends TileCoord {
  /** Surface kind; resolved through the surface registry. */
  readonly surface: SurfaceId;
  /**
   * Who may stand here. Denormalised by the finalize pass from surface,
   * props, walls and buildings; tactical never re-derives it.
   */
  readonly pass: PassMask;
  /** Thin walls on this tile's edges, mirrored on the neighbour (I3). */
  readonly walls: WallSet;
  /** Prop occupying this tile, if any. An occupied tile is never passable. */
  readonly propId?: string;
  /** Cover this tile grants to units on adjacent tiles. Denormalised from the prop. */
  readonly coverProvided: CoverLevel;
  /**
   * True when what occupies the tile blocks line of sight through it.
   * Denormalised from the prop definition; false without a prop, so a
   * sight rule never needs the prop registry.
   */
  readonly blocksLos: boolean;
  /** Set on interior floor, stair and roof tiles. */
  readonly buildingId?: string;
  /** Floor number within the building, 0 for the ground floor. */
  readonly floorIndex?: number;
  /** Room within the floor, when the tile lies inside a room partition. */
  readonly roomId?: string;
  /**
   * Set when this ground tile is the lower tile of a natural one-level step
   * and rises to meet it (#799). Movement goes through the matching
   * `slope` connector; this is what the renderer and the metrics read.
   */
  readonly slope?: Slope;
  /**
   * Set on every natural edge tile that has a wedge shape — the lower tile
   * of a natural one-level step the slope pass could piece — whether or
   * not the knob sloped it (#799). `slope` set ⇒ this is set. It is what
   * lets the Map Lab metric read the knob back from the frozen map
   * exactly: slopes over natural edges, with no guess about which cliffs
   * were graded.
   */
  readonly naturalEdge?: true;
}
