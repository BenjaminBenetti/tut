import type { Direction } from "../../core/model/direction";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { TileIndex } from "../../mapgen/service/tile-index";
import { tileTop } from "../view/tactical-map-view";
import { resolveDrawnDropships } from "./drawn-dropship-resolver";
import type { ModelPlacement } from "./map-model-resolver";

/** The registered aircraft points along +Z before the renderer's negative-Y quarter turns. */
const DROPSHIP_TURNS: Readonly<Record<Direction, Rotation>> = {
  s: 0,
  w: 1,
  n: 2,
  e: 3,
};

/**
 * One model per drawn drop ship (`resolveDrawnDropships`): the landing
 * zone's from the generator's complete envelope, never guessed from the
 * deploy centroid, and any forward extraction point's (#1179), its skids
 * `lift` layers above its level.
 *
 * @param map - The map to draw.
 * @param index - The map's tile index, when the caller has one.
 */
export function resolveDropshipModels(
  map: TacticalMap,
  index: TileIndex = new TileIndex(map),
): ModelPlacement[] {
  return resolveDrawnDropships(map, index).map((ship) => ({
    modelId: "tdf.dropship",
    level: ship.level,
    position: {
      x: ship.footprint.x + ship.footprint.w / 2,
      y: tileTop(ship.level + ship.lift),
      z: ship.footprint.z + ship.footprint.d / 2,
    },
    turns: DROPSHIP_TURNS[ship.facing],
    // The known transport shares its boarding zone's visibility, not an occluded hull cell.
    tile: ship.tile,
    ...(ship.occupiedTiles === undefined
      ? {}
      : { occupiedTiles: ship.occupiedTiles }),
  }));
}
