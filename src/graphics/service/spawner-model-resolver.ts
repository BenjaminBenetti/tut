import type { ModelAssetId } from "../../content/data/model-ids";
import type { SpawnerVariantCarrier } from "../../tactical/model/spawner-variant";
import { spawnerVariantOf } from "../../tactical/model/spawner-variant";
import type { SpawnerModelCatalogue } from "../model/spawner-models";

// ===========================================
// Resolver
// ===========================================

/**
 * The model to draw a spawner with: its variant's ripe model while it
 * is ripe and the variant has one, its standing model otherwise.
 *
 * ```
 *   egg spawner            ──► bug.egg-spawner
 *   spore pod              ──► bug.spore-pod
 *   spore pod, ripe        ──► bug.spore-pod-mature
 * ```
 *
 * @param spawner - The spawner, or anything naming its variant.
 * @param ripe - True while the objective tracking it is in its last turns.
 * @param catalogue - Every variant's models.
 */
export function spawnerModelId(
  spawner: SpawnerVariantCarrier,
  ripe: boolean,
  catalogue: SpawnerModelCatalogue,
): ModelAssetId {
  const models = catalogue[spawnerVariantOf(spawner)];
  return ripe && models.ripe !== undefined ? models.ripe : models.standing;
}
