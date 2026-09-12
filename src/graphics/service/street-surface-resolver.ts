import { DIRECTIONS, type Direction } from "../../core/model/direction";
import { directionOffset, stepGridPos } from "../../core/service/grid-math";
import { hashSeed } from "../../core/service/seed-hash";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { STREET_SURFACE_STYLE } from "../data/street-surface-style";
import { tileTop } from "../view/tactical-map-view";
import type { ModelPlacement } from "./map-model-resolver";

/**
 * Flush utility covers follow level curb stretches. The actual road tile owns
 * fog and elevation; these surfaces add no collision or visual cover volume.
 */
export function resolveStreetSurfaces(
  map: TacticalMap,
  index: TileIndex,
): readonly ModelPlacement[] {
  if (map.recipe.params.settlement === "rural") return [];
  const result: ModelPlacement[] = [];
  const style = STREET_SURFACE_STYLE;
  const phase = hashSeed(`${map.recipe.seed}:street-surfaces`);
  for (const tile of map.tiles) {
    if (!clearRoad(tile)) continue;
    if (
      map.dropships?.some(
        ({ clearance: r }) =>
          tile.x >= r.x &&
          tile.x < r.x + r.w &&
          tile.z >= r.z &&
          tile.z < r.z + r.d,
      )
    )
      continue;
    const sides = DIRECTIONS.filter(
      (side) =>
        index.getAt(stepGridPos(tile, side))?.surface === SurfaceIds.SIDEWALK,
    );
    const side = sides.length === 1 ? sides[0] : undefined;
    if (!side || !levelCurb(tile, side, index)) continue;
    const offset = directionOffset(side);
    const along = offset.x ? tile.z : tile.x;
    const across = offset.x ? tile.x : tile.z;
    const drain = (along + across + phase) % style.drainSpacing === 0;
    const manhole = (along + across + phase) % style.manholeSpacing === 3;
    if (!drain && !manhole) continue;
    result.push({
      modelId: drain ? "prop.curb-drain" : "prop.manhole",
      level: tile.y,
      position: {
        x: tile.x + 0.5 + (drain ? offset.x * style.curbOffset : 0),
        y: tileTop(tile.y) + style.lift,
        z: tile.z + 0.5 + (drain ? offset.z * style.curbOffset : 0),
      },
      turns: offset.x ? 0 : 1,
      tile: { x: tile.x, y: tile.y, z: tile.z },
    });
  }
  return result;
}

/** Excludes ramps, open cliff boundaries, objects and non-road surfaces. */
function clearRoad(tile: Tile | undefined): tile is Tile {
  return (
    tile?.surface === SurfaceIds.ROAD &&
    !tile.slope &&
    !tile.naturalEdge &&
    !tile.buildingId &&
    !tile.propId &&
    !Object.values(tile.walls).some((wall) => wall !== undefined)
  );
}

/** Consistent road and curb on both sides rules out corners, ramps and junctions. */
function levelCurb(tile: Tile, side: Direction, index: TileIndex): boolean {
  const offset = directionOffset(side);
  return [-2, -1, 0, 1, 2].every((distance) => {
    const road = index.get(
      tile.x + offset.z * distance,
      tile.y,
      tile.z + offset.x * distance,
    );
    if (!clearRoad(road)) return false;
    const curb = index.getAt(stepGridPos(road, side));
    return (
      curb?.surface === SurfaceIds.SIDEWALK && !curb.slope && !curb.naturalEdge
    );
  });
}
