import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalState } from "../model/tactical-state";
import type { UnitId } from "../model/unit";
import { footprintTiles } from "./footprint-service";

// ===========================================
// Map edge
// ===========================================

/**
 * True when any tile of a footprint lies on the map's outer ring
 * (#1179): the column or row a unit leaves the map from. A single tile
 * touches it on `x = 0`, `z = 0`, `x = width − 1` or `z = depth − 1`;
 * a block touches it when any of its tiles does. Levels do not matter:
 * a rooftop on the ring is as much the edge as the street below it.
 *
 * ```
 *   width 6               a 3×3 block anchored at A touches the edge
 *   ┌──────────────┐      when A.x = 0, A.z = 0,
 *   │ e e e e e e  │      A.x + 3 = width or A.z + 3 = depth
 *   │ e . . . . e  │
 *   │ e . . . . e  │      e = edge tiles
 *   │ e e e e e e  │
 *   └──────────────┘
 * ```
 *
 * @param map - The map, for its width and depth.
 * @param anchor - The footprint's lowest-`x`, lowest-`z` tile.
 * @param size - Tiles per side.
 * @returns Whether the footprint reaches the edge.
 */
export function touchesMapEdge(
  map: Pick<TacticalMap, "width" | "depth">,
  anchor: TileCoord,
  size: number,
): boolean {
  return footprintTiles(anchor, size).some(
    (tile) =>
      tile.x === 0 ||
      tile.z === 0 ||
      tile.x === map.width - 1 ||
      tile.z === map.depth - 1,
  );
}

/**
 * Takes a unit off the map by its edge (#1179): out of `units` and onto
 * the end of `escaped`, frozen as it was, the way an extraction moves a
 * unit to `extracted`. Nothing else changes; the vision recompute after
 * the command forgets it. An unknown unit leaves the mission as it was.
 *
 * Pure: never mutates `mission`.
 *
 * @param mission - The mission.
 * @param unitId - The unit leaving.
 * @returns The mission without the unit on the map.
 */
export function leaveByMapEdge(
  mission: TacticalState,
  unitId: UnitId,
): TacticalState {
  const unit = mission.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) {
    return mission;
  }
  return {
    ...mission,
    units: mission.units.filter((candidate) => candidate.id !== unitId),
    escaped: [...(mission.escaped ?? []), unit],
  };
}
