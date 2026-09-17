import { hashSeed } from "../../core/service/seed-hash";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { ModelPlacement } from "./map-model-resolver";
import { resinColonyDensity } from "./resin-colony-field";

/** Sparse wet seepage joins the host variants; pools fit the actual walkable surface. */
export function resolveResinFloorDetails(
  map: TacticalMap,
  ground: readonly ModelPlacement[],
  seed: number,
): ModelPlacement[] {
  const level = map.recipe.params.infestationLevel ?? 0;
  if (level < 3) return [];
  const result: ModelPlacement[] = [];
  for (const skin of ground) {
    const appearance = skin.resin;
    if (!appearance?.pattern || appearance.support.ramp) continue;
    const tile = skin.tile;
    const density = resinColonyDensity(tile.x + 0.5, tile.z + 0.5, seed);
    const variation = hashSeed(
      `${map.recipe.seed}:hive-floor:${tile.x}:${tile.z}:${tile.y}`,
    );
    if (
      variation % 100 >=
      (level - 2) * (density > 0.4 && density < 0.7 ? 1.8 : 0.6)
    )
      continue;
    const modelId = "infestation.resin.pool";
    result.push({
      ...skin,
      modelId,
      position: { ...skin.position, y: skin.position.y + 0.005 },
      resin: {
        support: appearance.support,
        conform: appearance.conform,
        turns: ((variation >>> 8) % 4) as Rotation,
        size: 0.65 + ((variation >>> 12) % 4) * 0.1,
        thickness: 0.3 + 0.07 * level,
      },
    });
  }
  return result;
}
