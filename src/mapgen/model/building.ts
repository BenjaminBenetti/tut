import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import type { TileCoord } from "./tile-coord";

// ===========================================
// Building
// ===========================================

/** Interior partition on one floor. */
export interface Room {
  readonly id: string;
  readonly floorIndex: number;
  readonly rect: Rect;
  /** Flavour for later passes, e.g. `hall`, `office`, `storage`. */
  readonly kind?: string;
}

/** One storey of a building. Its tiles are those with matching `buildingId` and `y`. */
export interface Floor {
  /** 0 is the ground floor. */
  readonly index: number;
  /** Level of this floor: `groundLevel + index`. */
  readonly y: number;
  readonly rooms: readonly Room[];
}

/** An exterior door, denormalised from the wall segments. */
export interface Entrance {
  /** Interior tile just inside the door. */
  readonly tile: TileCoord;
  /** Edge of that tile the door is on. */
  readonly side: Direction;
}

/** Roof shape. Only flat roofs can be walkable. */
export interface Roof {
  readonly kind: "flat" | "pitched";
  /** True when `roof` tiles exist at `groundLevel + floors.length`. */
  readonly walkable: boolean;
}

/**
 * A building is a record over tiles (ADR 0004 §4.5). Interior tiles point
 * back at it through `buildingId`; the building owns its floors, rooms,
 * entrances and the connectors that serve it.
 *
 * ```
 *   y = groundLevel + floors.length   roof tiles (if walkable)
 *   y = groundLevel + 1               floor 1
 *   y = groundLevel                   floor 0, entrances on the perimeter
 * ```
 */
export interface Building {
  readonly id: string;
  /** Template id from `mapgen/data/building-templates`. */
  readonly kind: string;
  /** Union of rectangles. M1.5 emits one; the model allows L and T shapes. */
  readonly footprint: readonly Rect[];
  /** Level of the flattened terrain under the building. */
  readonly groundLevel: number;
  /** At least one floor. */
  readonly floors: readonly Floor[];
  readonly roof: Roof;
  /** At least one exterior door on floor 0. */
  readonly entrances: readonly Entrance[];
  /** Stairs and ladders belonging to this building. */
  readonly connectorIds: readonly string[];
}
