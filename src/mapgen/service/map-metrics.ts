import { DIRECTIONS } from "../../core/model/direction";
import { SurfaceIds } from "../data/surfaces";
import { CoverLevel } from "../model/cover";
import type { MapMetrics } from "../model/map-metrics";
import { PassMask } from "../model/pass-mask";
import type { TacticalMap } from "../model/tactical-map";
import { hatchSpace } from "./hatch-space";
import { ReachabilityService } from "./reachability-service";
import { TileIndex } from "./tile-index";

// ===========================================
// Map metrics
// ===========================================

/**
 * Measures a finished map for tuning: how much of the walkable ground has
 * cover or a wall beside it, cover props per area, how furnished the
 * interiors are, vertical connectors, and the hatch space every objective
 * gets. Pure; the preview panel shows the result and tests assert on it.
 */
export function computeMapMetrics(map: TacticalMap): MapMetrics {
  const index = new TileIndex(map);
  let groundTiles = 0;
  let openTiles = 0;
  let besideCover = 0;
  let besideWall = 0;
  let high = 0;
  let low = 0;
  for (const tile of map.tiles) {
    if (tile.buildingId !== undefined || tile.surface === SurfaceIds.WATER) {
      continue;
    }
    groundTiles++;
    if (tile.coverProvided === CoverLevel.HIGH) high++;
    if (tile.coverProvided === CoverLevel.LOW) low++;
    if ((tile.pass & PassMask.INFANTRY) === 0) {
      continue;
    }
    openTiles++;
    if (
      DIRECTIONS.some(
        (direction) =>
          (index.neighbour(tile, direction)?.coverProvided ?? 0) > 0,
      )
    ) {
      besideCover++;
    }
    if (DIRECTIONS.some((direction) => tile.walls[direction] !== undefined)) {
      besideWall++;
    }
  }

  const interiorProps = map.props.filter(
    (prop) => index.getAt(prop.tile)?.buildingId !== undefined,
  ).length;
  const count = (kind: string): number =>
    map.connectors.filter((c) => c.kind === kind).length;

  const reach = new ReachabilityService(index, map.connectors);
  const spaces: number[] = [];
  for (const objective of map.hooks.objectives) {
    const origin = objective.tiles[0];
    const radius = objective.meta?.hatchRadius;
    if (origin !== undefined && typeof radius === "number") {
      spaces.push(
        hatchSpace({ index, reach }, origin, radius, PassMask.INFANTRY),
      );
    }
  }

  return {
    groundTiles,
    openTiles,
    coverAdjacency: ratio(besideCover, openTiles),
    wallAdjacency: ratio(besideWall, openTiles),
    highCoverPer100: 100 * ratio(high, groundTiles),
    lowCoverPer100: 100 * ratio(low, groundTiles),
    interiorPropsPerBuilding: ratio(interiorProps, map.buildings.length),
    ramps: count("ramp"),
    stairs: count("stairs"),
    ladders: count("ladder"),
    maxFloors: Math.max(0, ...map.buildings.map((b) => b.floors.length)),
    hatchSpaceMin: spaces.length === 0 ? 0 : Math.min(...spaces),
    hatchSpaceMean: ratio(
      spaces.reduce((sum, s) => sum + s, 0),
      spaces.length,
    ),
  };
}

/** `numerator / denominator`, or 0 when the denominator is 0. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
