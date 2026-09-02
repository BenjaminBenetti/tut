import type { CoverLevel } from "./cover";
import type { PassMask } from "./pass-mask";
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
 *   y=2   [roof ][roof ]
 *   y=1   [floor][floor]            ← building tiles carry buildingId
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
  /** Set on interior floor, stair and roof tiles. */
  readonly buildingId?: string;
  /** Floor number within the building, 0 for the ground floor. */
  readonly floorIndex?: number;
  /** Room within the floor, when the tile lies inside a room partition. */
  readonly roomId?: string;
}
