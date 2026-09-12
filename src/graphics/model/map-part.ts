import type { Direction } from "../../core/model/direction";

// ===========================================
// Map parts
// ===========================================

/**
 * The identity of one demolishable piece of the drawn map (#1121): a
 * prop, or one wall on one edge of one tile. The resolver stamps it on
 * a placement and the map view stamps it on the instance drawn for it,
 * so when the mission's map loses the piece the view can collapse
 * exactly that instance and nothing beside it.
 *
 * ```
 *   prop:<propId>                 the whole prop, however many tiles
 *   wall:<tileKey>:<side>         one edge; the mirrored edge is its own part
 * ```
 *
 * A string rather than an object because it is compared and nothing
 * else, and because an instance batch carries thousands of them.
 */
export type MapPartId = string;

/** The part id of a prop. */
export function propPart(propId: string): MapPartId {
  return `prop:${propId}`;
}

/** The part id of the wall on `side` of the tile with index key `tileKey`. */
export function wallPart(tileKey: number, side: Direction): MapPartId {
  return `wall:${String(tileKey)}:${side}`;
}
