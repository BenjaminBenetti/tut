import { DIRECTIONS } from "../../core/model/direction";
import { SurfaceIds } from "../data/surfaces";
import { CoverLevel } from "../model/cover";
import type { MapMetrics } from "../model/map-metrics";
import { PassMask } from "../model/pass-mask";
import type { TacticalMap } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import { hatchSpace } from "./hatch-space";
import { oppositeDirection, stepGridPos } from "../../core/service/grid-math";
import { ReachabilityService } from "./reachability-service";
import { TileIndex } from "./tile-index";

// ===========================================
// Map metrics
// ===========================================

/**
 * Measures a finished map for tuning: how much of the walkable ground has
 * cover or a wall beside it, how many of a tile's sides that cover
 * actually holds against, cover props per area, how furnished the
 * interiors are, vertical connectors, and the hatch space every objective
 * gets. Pure; the preview panel shows the result and tests assert on it.
 */
export function computeMapMetrics(map: TacticalMap): MapMetrics {
  const index = new TileIndex(map);
  let groundTiles = 0;
  let openTiles = 0;
  let besideCover = 0;
  let besideWall = 0;
  let coveredSides = 0;
  let covered = 0;
  let flankProof = 0;
  let closedSides = 0;
  let sheltered = 0;
  let backToWall = 0;
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
    const sides = coveredSidesOf(index, tile);
    coveredSides += sides;
    if (sides >= 1) covered++;
    if (sides >= 2) flankProof++;
    const closed = closedSidesOf(index, tile);
    closedSides += closed;
    if (closed >= 1) sheltered++;
    if (closed >= 2) backToWall++;
  }

  const interiorProps = map.props.filter(
    (prop) => index.getAt(prop.tile)?.buildingId !== undefined,
  ).length;
  const count = (kind: string): number =>
    map.connectors.filter((c) => c.kind === kind).length;

  const reach = new ReachabilityService(index, map.connectors);
  const slopes = slopeMetrics(map, index);
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
    coveredSidesMean: ratio(coveredSides, openTiles),
    coveredShare: ratio(covered, openTiles),
    flankProofShare: ratio(flankProof, openTiles),
    closedSidesMean: ratio(closedSides, openTiles),
    shelteredShare: ratio(sheltered, openTiles),
    backToWallShare: ratio(backToWall, openTiles),
    highCoverPer100: 100 * ratio(high, groundTiles),
    lowCoverPer100: 100 * ratio(low, groundTiles),
    interiorPropsPerBuilding: ratio(interiorProps, map.buildings.length),
    slopes: slopes.slopes,
    slopeShare: slopes.share,
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

/**
 * How many of a tile's four sides give its occupant cover. A side counts
 * when the tile carries a wall on that edge — every wall kind is worth at
 * least low cover, and tactical grades which — or when the neighbour on
 * that side, at the same level, provides cover. This is the shape
 * `coverAgainst` reads for the one or two sides a shot arrives from, so
 * two covered sides is a position that holds against a second direction.
 *
 * ```
 *   . B .        B provides cover      sides = 2  (n from the boulder,
 *   . T |        | is a wall on T's e             e from the wall)
 *   . . .
 * ```
 */
function coveredSidesOf(index: TileIndex, tile: Tile): number {
  return DIRECTIONS.filter(
    (direction) =>
      tile.walls[direction] !== undefined ||
      (index.neighbour(tile, direction)?.coverProvided ?? CoverLevel.NONE) >
        CoverLevel.NONE,
  ).length;
}

/**
 * How many of a tile's four sides no unit can stand on: the neighbour at
 * the same level is missing — the map edge, a building footprint, open
 * air — or does not admit infantry, which covers props and water.
 *
 * This is the cover that stops a melee attacker (#446). A prop tile is
 * impassable, so a boulder to the north does not reduce a swarmer's
 * chance to hit: it means no swarmer can be north of you. Occupancy
 * only, so nothing here needs tactical's sight rule.
 *
 * ```
 *   . B .      B is a boulder, T the tile: the north side is closed and
 *   . T #      # a building, so the east side is too. Two directions
 *   . . .      fewer for a swarm to arrive from.
 * ```
 */
function closedSidesOf(index: TileIndex, tile: Tile): number {
  return DIRECTIONS.filter((direction) => {
    const neighbour = index.neighbour(tile, direction);
    return (
      neighbour === undefined ||
      (neighbour.pass & PassMask.INFANTRY) !== PassMask.INFANTRY
    );
  }).length;
}

/** `numerator / denominator`, or 0 when the denominator is 0. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

// ===========================================
// Slopes (#799)
// ===========================================

/**
 * Counts slope pieces against every natural edge tile: a ground tile with
 * a ground neighbour exactly one level up, no wall between them, and no
 * building within one tile of either. That is what the slope pass slopes
 * when the knob is at 1, so the share reads the knob back.
 */
function slopeMetrics(
  map: TacticalMap,
  index: TileIndex,
): { slopes: number; share: number } {
  const nearBuilding = new Set<string>();
  for (const b of map.buildings) {
    const fp = b.footprint[0];
    if (fp === undefined) continue;
    for (let z = fp.z - 1; z <= fp.z + fp.d; z++) {
      for (let x = fp.x - 1; x <= fp.x + fp.w; x++)
        nearBuilding.add(`${String(x)},${String(z)}`);
    }
  }
  let slopes = 0;
  let naturalEdges = 0;
  for (const tile of map.tiles) {
    if (tile.buildingId !== undefined) continue;
    if (tile.slope !== undefined) {
      slopes++;
      naturalEdges++;
      continue;
    }
    if (nearBuilding.has(`${String(tile.x)},${String(tile.z)}`)) continue;
    const isEdge = DIRECTIONS.some((side) => {
      if (tile.walls[side] !== undefined) return false;
      const step = stepGridPos(tile, side);
      const up = index.get(step.x, tile.y + 1, step.z);
      return (
        up !== undefined &&
        up.buildingId === undefined &&
        up.walls[oppositeDirection(side)] === undefined &&
        !nearBuilding.has(`${String(up.x)},${String(up.z)}`)
      );
    });
    if (isEdge) naturalEdges++;
  }
  return { slopes, share: naturalEdges === 0 ? 1 : slopes / naturalEdges };
}
