import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { NATURAL_MATERIAL_SURFACES } from "../data/natural-material-transition";

/** One-based categorical ids; zero is a built, water or absent surface. */
export function naturalMaterialId(surface: string): number {
  return NATURAL_MATERIAL_SURFACES.findIndex((id) => id === surface) + 1;
}

/**
 * A categorical column image for material drawing only. It cannot alter the
 * map, slopes, movement or cover. Walled ground keeps its deliberate edge.
 */
export function naturalMaterialField(map: TacticalMap): Uint8Array {
  const pixels = new Uint8Array(map.width * map.depth * 4);
  for (const tile of map.tiles) {
    if (tile.buildingId !== undefined || Object.keys(tile.walls).length > 0)
      continue;
    const id = naturalMaterialId(tile.surface);
    if (id === 0) continue;
    const offset = (tile.z * map.width + tile.x) * 4;
    pixels[offset] = id;
    pixels[offset + 3] = 255;
  }
  return pixels;
}
