import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import type { TerrainSlopeAppearance } from "../model/terrain-slope-appearance";
import { resolveDiagonalSlopeAppearances } from "./diagonal-slope-resolver";
import { resolveThreeSidedSlopeAppearances } from "./three-sided-slope-resolver";

/** Combines fitted terrain families without replacing an accepted diagonal or cap. */
export function resolveTerrainSlopeAppearances(
  map: TacticalMap,
  index: TileIndex,
): ReadonlyMap<number, TerrainSlopeAppearance> {
  const diagonal = resolveDiagonalSlopeAppearances(map, index);
  return new Map([
    ...diagonal,
    ...resolveThreeSidedSlopeAppearances(map, index, diagonal),
  ]);
}
