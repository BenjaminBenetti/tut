import type { ModelAssetId } from "../../content/data/model-ids";
import type { SpawnerVariantCarrier } from "../../tactical/model/spawner-variant";
import type { Spawner } from "../../tactical/model/tactical-state";
import { spawnerVariantOf } from "../../tactical/model/spawner-variant";
import type { SpawnerModelCatalogue } from "../model/spawner-models";

// ===========================================
// Resolver
// ===========================================

/**
 * The model to draw a spawner with: its variant's ripe model while it
 * is ripe and the variant has one, else its damaged model once it is
 * below half its full hit points and the variant has one, its standing
 * model otherwise.
 *
 * ```
 *   egg spawner                   ──► bug.egg-spawner
 *   spore pod                     ──► bug.spore-pod
 *   spore pod, ripe               ──► bug.spore-pod-mature
 *   hive core                     ──► bug.hive-core
 *   hive core, hp × 2 < maxHp     ──► bug.hive-core-damaged
 * ```
 *
 * A spawner that does not know its full hit points (no `maxHp`, as
 * every egg spawner and pod) is never damaged.
 *
 * @param spawner - The spawner, or anything naming its variant and hit points.
 * @param ripe - True while the objective tracking it is in its last turns.
 * @param catalogue - Every variant's models.
 */
export function spawnerModelId(
  spawner: SpawnerVariantCarrier & Partial<Pick<Spawner, "hp" | "maxHp">>,
  ripe: boolean,
  catalogue: SpawnerModelCatalogue,
): ModelAssetId {
  const models = catalogue[spawnerVariantOf(spawner)];
  if (ripe && models.ripe !== undefined) {
    return models.ripe;
  }
  if (models.damaged !== undefined && belowHalf(spawner)) {
    return models.damaged;
  }
  return models.standing;
}

// ===========================================
// Helpers
// ===========================================

/** True when the spawner knows its full hit points and has fewer than half left. */
function belowHalf(spawner: Partial<Pick<Spawner, "hp" | "maxHp">>): boolean {
  return (
    spawner.hp !== undefined &&
    spawner.maxHp !== undefined &&
    spawner.hp * 2 < spawner.maxHp
  );
}
