import { hashSeed } from "../../core/service/seed-hash";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Rotation } from "../../mapgen/model/prop";
import { INFESTED_MODEL_VARIANTS } from "../data/infested-model-variants";
import type { ModelPlacement } from "./map-model-resolver";

/** Local colony pressure owns the visual spread; legacy recipes retain deterministic swaps. */
export function infestModel(
  placement: ModelPlacement,
  map: TacticalMap,
): ModelPlacement {
  const recipe = map.recipe;
  const level = recipe.params.infestation ?? 0;
  const variant = INFESTED_MODEL_VARIANTS[placement.modelId];
  const { x, y, z } = placement.position;
  if (
    !variant ||
    level === 0 ||
    hashSeed(`${recipe.seed}:infested:${placement.modelId}:${x}:${y}:${z}`) /
      0x100000000 >=
      infestationPressure(map, placement.tile)
  )
    return placement;
  return {
    ...placement,
    modelId:
      placement.modelId === "building.wall" &&
      infestationPressure(map, placement.tile) > 0.7
        ? "building.wall-brick-breached"
        : variant.modelId,
    turns: ((placement.turns + variant.turns) % 4) as Rotation,
  };
}

/** Samples the saved colony field without consuming simulation randomness. */
export function infestationPressure(map: TacticalMap, tile: TileCoord): number {
  if ((map.recipe.params.infestation ?? 0) === 0) return 0;
  if (!map.infestation) return (map.recipe.params.infestation ?? 0) / 10;
  return map.infestation.influence[tile.z * map.width + tile.x] ?? 0;
}
