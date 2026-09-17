import { hashSeed } from "../../core/service/seed-hash";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { INFESTED_MODEL_VARIANTS } from "../data/infested-model-variants";
import type { ModelPlacement } from "./map-model-resolver";

/**
 * Selects a complete host model: stage 1 at levels 1–3, stage 2 at 4–6,
 * then a growing proportion of stage 3 at 7–10. The stable host hash keeps
 * changes monotonic as the slider rises, with 30% established pockets at ten.
 */
export function infestedModelStage(level: number, identity: string): 1 | 2 | 3 {
  if (level < 4) return 1;
  if (level < 7) return 2;
  return hashSeed(identity) % 100 < 25 + (level - 7) * 15 ? 3 : 2;
}

/**
 * Replaces only the mesh id. The original material family, transform, sockets,
 * ownership, fog, cutaway and demolition identity belong to the host. Objects
 * without an authored variant retain their own silhouette.
 */
export function resolveInfestedModels(
  map: TacticalMap,
  index: TileIndex,
  placements: readonly ModelPlacement[],
): readonly ModelPlacement[] {
  const level = map.recipe.params.infestationLevel ?? 0;
  if (level === 0) return placements;
  return placements.map((host) => {
    const variants = INFESTED_MODEL_VARIANTS[host.modelId];
    if (!variants) return host;
    const side = host.part?.startsWith("wall:")
      ? host.part.split(":").at(-1)
      : undefined;
    const adjacent = side
      ? index.get(
          host.tile.x + (side === "e" ? 1 : side === "w" ? -1 : 0),
          host.tile.y,
          host.tile.z + (side === "s" ? 1 : side === "n" ? -1 : 0),
        )
      : undefined;
    const infested =
      adjacent?.infested ??
      (host.occupiedTiles ?? [host.tile]).some(
        (tile) => index.getAt(tile)?.infested,
      );
    if (!infested) return host;
    const identity = `${map.recipe.seed}:host-infestation:${host.part ?? `${host.modelId}:${host.tile.x}:${host.tile.z}`}`;
    return {
      ...host,
      modelId: variants[infestedModelStage(level, identity) - 1]!,
    };
  });
}
