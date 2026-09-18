import { hashSeed } from "../../core/service/seed-hash";
import type { MapRecipe } from "../../mapgen/model/map-recipe";
import type { Rotation } from "../../mapgen/model/prop";
import { INFESTED_MODEL_VARIANTS } from "../data/infested-model-variants";
import type { ModelPlacement } from "./map-model-resolver";

/** Stable per-object swaps grow from none at zero to all supported assets at ten. */
export function infestModel(
  placement: ModelPlacement,
  recipe: MapRecipe,
): ModelPlacement {
  const level = recipe.params.infestation ?? 0;
  const variant = INFESTED_MODEL_VARIANTS[placement.modelId];
  const { x, y, z } = placement.position;
  if (
    !variant ||
    level === 0 ||
    hashSeed(`${recipe.seed}:infested:${placement.modelId}:${x}:${y}:${z}`) /
      0x100000000 >=
      level / 10
  )
    return placement;
  return {
    ...placement,
    modelId: variant.modelId,
    turns: ((placement.turns + variant.turns) % 4) as Rotation,
  };
}
