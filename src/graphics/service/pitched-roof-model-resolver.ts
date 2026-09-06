import { STOREY_LAYERS } from "../../core/model/elevation";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { PITCHED_ROOF_MODEL } from "../data/map-model-table";
import { PITCHED_ROOF_STYLE } from "../data/pitched-roof-style";
import type { PitchedRoofAppearance } from "../model/pitched-roof-appearance";
import { tileTop } from "../view/tactical-map-view";
import type { ModelPlacement } from "./map-model-resolver";

/** Stable geometry key, shared across buildings, tiles and elevation batches. */
export function pitchedRoofKey(roof: PitchedRoofAppearance): string {
  return roof.heights.join(":");
}

/**
 * Covers pitched, non-walkable building records without inventing roof tiles.
 * Each rectangle has its ridge along its longer axis; overlapping rectangles
 * own a cell only once. Vision follows the highest real building tile below
 * the cap, including lower landings underneath a top-storey stairwell hole.
 */
export function resolvePitchedRoofModels(
  map: TacticalMap,
  index: TileIndex,
): readonly ModelPlacement[] {
  const result: ModelPlacement[] = [];
  for (const building of map.buildings) {
    if (building.roof.kind !== "pitched" || building.roof.walkable) continue;
    const level = building.groundLevel + building.floors.length * STOREY_LAYERS;
    const covered = new Set<string>();
    for (const rect of building.footprint) {
      const alongX = rect.w <= rect.d;
      const width = alongX ? rect.w : rect.d;
      for (let z = rect.z; z < rect.z + rect.d; z++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          const key = `${x},${z}`;
          if (covered.has(key)) continue;
          const tile = index
            .column(x, z)
            .filter((t) => t.buildingId === building.id && t.y < level)
            .at(-1);
          if (!tile) continue;
          covered.add(key);
          const offset = alongX ? x - rect.x : z - rect.z;
          const height = (u: number): number =>
            PITCHED_ROOF_STYLE.eaveThickness +
            Math.min(u, width - u) * PITCHED_ROOF_STYLE.risePerTile;
          result.push({
            modelId: PITCHED_ROOF_MODEL,
            level,
            position: { x: x + 0.5, y: tileTop(level), z: z + 0.5 },
            turns: alongX ? 0 : 1,
            roof: {
              heights: [
                height(offset),
                height(offset + 0.5),
                height(offset + 1),
              ],
            },
            tile,
          });
        }
      }
    }
  }
  return result;
}
