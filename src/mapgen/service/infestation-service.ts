import type { Rng } from "../../core/model/rng";
import { MAP_INFESTATION_TUNING } from "../data/infestation-tuning";
import { SurfaceIds } from "../data/surfaces";
import type { InfestationTuning } from "../model/infestation-tuning";
import type { TacticalMap } from "../model/tactical-map";
import { ValueNoise } from "./value-noise";

/**
 * Adds nested seeded patches to the finished map without touching the base
 * generation. The same ranking is used at every level, so raising the dial
 * can only add infested tiles. Floors and roofs share the ground's field.
 * Water and the landed aircraft's solid hull are never coated.
 */
export function infestMap(
  map: TacticalMap,
  rng: Rng,
  tuning: InfestationTuning = MAP_INFESTATION_TUNING,
): TacticalMap {
  const level = map.recipe.params.infestationLevel ?? 0;
  if (level === 0) return map;
  const noise = new ValueNoise(rng);
  const candidates = map.tiles
    .filter(
      (tile) =>
        tile.surface !== SurfaceIds.WATER &&
        !(map.dropships ?? []).some(
          (site) =>
            tile.x >= site.footprint.x &&
            tile.x < site.footprint.x + site.footprint.w &&
            tile.z >= site.footprint.z &&
            tile.z < site.footprint.z + site.footprint.d,
        ),
    )
    .map((tile) => ({
      tile,
      score:
        noise.fbm(
          tile.x / tuning.patchSize,
          tile.z / tuning.patchSize,
          3,
          0.35,
        ) +
        tile.y * 0.002,
    }));
  candidates.sort(
    (a, b) =>
      a.score - b.score ||
      a.tile.y - b.tile.y ||
      a.tile.z - b.tile.z ||
      a.tile.x - b.tile.x,
  );
  const count = Math.floor(
    candidates.length * (tuning.coverageByLevel[level] ?? 0),
  );
  const infested = new Set(candidates.slice(0, count).map(({ tile }) => tile));
  return {
    ...map,
    tiles: map.tiles.map((tile) =>
      infested.has(tile) ? { ...tile, infested: true } : tile,
    ),
  };
}
