import { STOREY_LAYERS } from "../../core/model/elevation";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { mechCanOccupyRoof } from "./mech-rooftop-service";
import { traceLine } from "./sight-service";

/** Jet-assisted flight rises above both endpoints before traversing and descending. */
export function jumpApex(from: TileCoord, to: TileCoord): number {
  return Math.max(from.y, to.y) + STOREY_LAYERS;
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
      const building = surface.buildingId
        ? map.buildings.find(({ id }) => id === surface.buildingId)
        : undefined;
      const roof = building
        ? building.groundLevel +
          STOREY_LAYERS *
            (building.floors.length +
              (building.roof.kind === "pitched" ? 1 : 0))
        : surface.y;
      const wallHeight = Object.values(surface.walls).reduce<number>(
        (height, wall) =>
          Math.max(
            height,
            wall === undefined ? 0 : wall === "half" ? 1 : STOREY_LAYERS,
          ),
        0,
      );
      const obstacle = Math.max(
        roof,
        surface.y + (surface.blocksLos ? STOREY_LAYERS : wallHeight),
      );
      if (obstacle > apex)
        return "A building or high obstacle blocks the jump flight path";
    }
  }
  return undefined;
}
