import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { SurfaceId } from "../../mapgen/model/surface";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { TileIndex } from "../../mapgen/service/tile-index";
import { surfaceModel } from "../data/map-model-table";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { GROUND_SLAB_THICKNESS } from "../data/tactical-overlay-palette";
import type { ModelManifest } from "../model/asset-manifest";
import type { TileRise } from "../model/tile-rise";

// ===========================================
// Surface rise
// ===========================================

/**
 * How far a surface's slab stands above `tileTop` (#1130).
 *
 * Every ground surface is a centre-pivoted slab that `map-model-resolver`
 * drops half a `GROUND_SLAB_THICKNESS` so a slab of that thickness lands
 * its top face on `tileTop`. A thicker slab lands its top face higher by
 * half the difference, and the sidewalk is one: authored 0.12 thick as
 * a raised kerb against the 0.05 road, its top stands 0.035 above the
 * plane, which is more than the 0.02 and 0.03 the move bands are lifted
 * by, so the bands were drawn inside the slab and depth-tested away.
 *
 * ```
 *                ┌──────────────┐ ← sidewalk top: tileTop + 0.035
 *   ── tileTop ──┤   sidewalk   ├──────── road top: tileTop
 *   ▒▒▒▒ road ▒▒▒│  (0.12 thick) │▒▒▒▒▒▒▒▒ both pivots at tileTop − 0.025
 *                └──────────────┘
 * ```
 *
 * The thickness is the manifest's `height` for the surface's model, so
 * the number follows the art rather than being copied from it. Stairs
 * are pivoted at their base and stand on the plane, so they rise
 * nothing; water is recessed, and a slab thinner than the ground's
 * never rises above it.
 *
 * @param surface - The surface id of the tile.
 * @param manifest - The model registry; the shipped one by default.
 * @returns World units above `tileTop`, never negative.
 */
export function surfaceRise(
  surface: SurfaceId,
  manifest: ModelManifest = MODEL_MANIFEST,
): number {
  if (surface === SurfaceIds.STAIRS) {
    return 0;
  }
  const modelId = surfaceModel(surface);
  if (modelId === undefined) {
    return 0;
  }
  return Math.max(0, (manifest[modelId].height - GROUND_SLAB_THICKNESS) / 2);
}

/**
 * The rise of every tile on `map`, for the overlays (#1130): the tile's
 * surface looked up once and its rise from `surfaceRise`. A coordinate
 * that names no tile rises nothing, so a caller painting off the map
 * is no worse off than before.
 *
 * @param map - The map the overlays are painted on.
 * @param manifest - The model registry; the shipped one by default.
 * @returns A resolver the overlay layers call per tile.
 */
export function tileRiseFor(
  map: TacticalMap,
  manifest: ModelManifest = MODEL_MANIFEST,
): TileRise {
  const index = new TileIndex(map);
  const bySurface = new Map<SurfaceId, number>();
  return (tile) => {
    const found = index.getAt(tile);
    if (found === undefined) {
      return 0;
    }
    let rise = bySurface.get(found.surface);
    if (rise === undefined) {
      rise = surfaceRise(found.surface, manifest);
      bySurface.set(found.surface, rise);
    }
    return rise;
  };
}
