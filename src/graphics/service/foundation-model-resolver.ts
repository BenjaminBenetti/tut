import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import { FOUNDATION_MODEL } from "../data/map-model-table";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { LAYER_HEIGHT, SLAB_HEIGHT } from "../data/mapgen-preview-palette";
import { GROUND_SLAB_THICKNESS } from "../data/tactical-overlay-palette";
import type { ModelPlacement } from "./map-model-resolver";

/** Height of the implicit solid under floor zero, meeting the real floor or stairs base. */
export function foundationHeight(tile: Tile): number {
  if (tile.buildingId === undefined || tile.floorIndex !== 0) return 0;
  // The shipped floor GLB is base-centred at resolveTiles' half-slab drop;
  // stairs stand directly on tileTop. Match those actual model bases.
  const floorBaseDrop =
    tile.surface === SurfaceIds.STAIRS ? 0 : GROUND_SLAB_THICKNESS / 2;
  return tile.y * LAYER_HEIGHT + SLAB_HEIGHT - floorBaseDrop;
}

/** Draws the solid below elevated buildings without adding standable surfaces to the map. */
export function resolveFoundationModels(
  map: TacticalMap,
): readonly ModelPlacement[] {
  const result: ModelPlacement[] = [];
  for (const tile of map.tiles) {
    const height = foundationHeight(tile);
    for (let bottom = 0; bottom < height - 0.000001; bottom += LAYER_HEIGHT) {
      const course = Math.min(LAYER_HEIGHT, height - bottom);
      result.push({
        modelId: FOUNDATION_MODEL,
        level: tile.y,
        position: { x: tile.x + 0.5, y: bottom, z: tile.z + 0.5 },
        turns: 0,
        scaleY: course / MODEL_MANIFEST[FOUNDATION_MODEL].height,
        tile,
      });
    }
  }
  return result;
}
