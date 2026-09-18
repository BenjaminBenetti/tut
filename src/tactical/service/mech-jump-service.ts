import {
  directionOffset,
  oppositeDirection,
} from "../../core/service/grid-math";
import { STOREY_LAYERS } from "../../core/model/elevation";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { mechCanOccupyRoof } from "./mech-rooftop-service";
import { traceLine } from "./sight-service";
import { jumpArcLift, jumpArcTime } from "./jump-trajectory-service";

/** Minimum peak of a jump, one storey above either endpoint. */
export function jumpApex(from: TileCoord, to: TileCoord): number {
  return Math.max(from.y, to.y) + STOREY_LAYERS;
}

/** Raises one continuous arch enough to clear the validated corridor at each crossed edge. */
export function jumpFlightApex(
  map: TacticalMap,
  index: TileIndex,
  from: TileCoord,
  to: TileCoord,
): number {
  const dy = to.y - from.y;
  const minimum = jumpApex(from, to);
  const minimumLift = jumpArcLift(from.y, to.y, minimum);
  let lift = minimumLift;
  /** Fits the parabola above an obstacle at its actual position along the route. */
  const clearAt = (height: number, fraction: number): void => {
    const t = jumpArcTime(fraction);
    if (t === 0 || t === 1) return;
    lift = Math.max(lift, (height + 0.1 - from.y - dy * t) / (t * (1 - t)));
  };
  const line = traceLine(from, to);
  for (const cell of line.cells) {
    for (const surface of index.column(cell.x, cell.z)) {
      const height = solidTop(map, surface);
      clearAt(height, cell.tEnter);
      clearAt(height, cell.tExit);
    }
  }
  for (const crossing of line.crossings) {
    for (const cell of crossing.grazed) {
      for (const surface of index.column(cell.x, cell.z)) {
        clearAt(solidTop(map, surface), crossing.t);
      }
    }
    for (const edge of crossing.edges) {
      const offset = directionOffset(edge.side);
      for (const face of [
        edge,
        {
          x: edge.x + offset.x,
          z: edge.z + offset.z,
          side: oppositeDirection(edge.side),
        },
      ]) {
        for (const surface of index.column(face.x, face.z)) {
          const wall = surface.walls[face.side];
          if (wall)
            clearAt(
              surface.y + (wall === "half" ? 1 : STOREY_LAYERS),
              crossing.t,
            );
        }
      }
    }
  }
  return lift === minimumLift
    ? minimum
    : from.y + (dy + lift) ** 2 / (4 * lift);
}

/** Height of solid terrain, buildings and props; walls are checked at their crossed edge. */
function solidTop(map: TacticalMap, surface: Tile): number {
  const building = surface.buildingId
    ? map.buildings.find(({ id }) => id === surface.buildingId)
    : undefined;
  const roof = building
    ? building.groundLevel +
      STOREY_LAYERS *
        (building.floors.length + (building.roof.kind === "pitched" ? 1 : 0))
    : surface.y;
  return Math.max(roof, surface.y + (surface.blocksLos ? STOREY_LAYERS : 0));
}

/** Checks the whole flight corridor, including ceilings and roofs without surface tiles. */
export function jumpObstruction(
  map: TacticalMap,
  index: TileIndex,
  from: TileCoord,
  to: TileCoord,
): string | undefined {
  for (const endpoint of [from, to]) {
    const tile = index.getAt(endpoint);
    if (
      !tile ||
      (tile.buildingId && !mechCanOccupyRoof(map, tile)) ||
      index
        .column(endpoint.x, endpoint.z)
        .some((surface) => surface.y > endpoint.y)
    ) {
      return "Jump needs open sky and a clear outdoor or flat-roof landing";
    }
  }
  const apex = jumpApex(from, to);
  const line = traceLine(from, to);
  const cells = [
    ...line.cells,
    ...line.crossings.flatMap(({ grazed }) => grazed),
  ];
  for (const cell of cells) {
    for (const surface of index.column(cell.x, cell.z)) {
      const wallHeight = Object.values(surface.walls).reduce<number>(
        (height, wall) =>
          Math.max(
            height,
            wall === undefined ? 0 : wall === "half" ? 1 : STOREY_LAYERS,
          ),
        0,
      );
      const obstacle = Math.max(solidTop(map, surface), surface.y + wallHeight);
      if (obstacle > apex)
        return "A building or high obstacle blocks the jump flight path";
    }
  }
  return undefined;
}
