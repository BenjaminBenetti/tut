import { hashSeed } from "../../core/service/seed-hash";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { ROOF_DETAIL_STYLE } from "../data/roof-detail-style";
import { tileTop } from "../view/tactical-map-view";
import type { ModelPlacement } from "./map-model-resolver";

/** Adds a chimney to existing non-walkable house roofs, fitted to their exact pitched/hipped profile. */
export function resolveRoofDetails(
  map: TacticalMap,
  index: TileIndex,
  roofs: readonly ModelPlacement[],
): readonly ModelPlacement[] {
  const result: ModelPlacement[] = [];
  for (const building of map.buildings) {
    if (
      building.kind !== "house" ||
      building.roof.kind !== "pitched" ||
      building.roof.walkable
    )
      continue;
    const inset = ROOF_DETAIL_STYLE.edgeInset;
    const candidates = roofs.filter(
      (roof) =>
        roof.roof &&
        index.getAt(roof.tile)?.buildingId === building.id &&
        building.footprint.some(
          (rect) =>
            roof.tile.x >= rect.x + inset &&
            roof.tile.x < rect.x + rect.w - inset &&
            roof.tile.z >= rect.z + inset &&
            roof.tile.z < rect.z + rect.d - inset,
        ),
    );
    if (candidates.length === 0) continue;
    const chosen =
      candidates[
        hashSeed(`${map.recipe.seed}:${building.id}:chimney`) %
          candidates.length
      ]!;
    const roof = chosen.roof!;
    const top = Math.min(roof.heights[1], roof.depthHeights?.[1] ?? Infinity);
    result.push({
      modelId: "building.chimney",
      level: chosen.level,
      position: {
        x: chosen.position.x,
        y: tileTop(chosen.level) + top - ROOF_DETAIL_STYLE.roofEmbed,
        z: chosen.position.z,
      },
      turns: 0,
      tile: chosen.tile,
    });
  }
  return result;
}
