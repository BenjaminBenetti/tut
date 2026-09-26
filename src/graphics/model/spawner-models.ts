import type { ModelAssetId } from "../../content/data/model-ids";
import type { SpawnerVariant } from "../../tactical/model/spawner-variant";

// ===========================================
// Spawner models
// ===========================================

/**
 * The models a spawner variant is drawn with. A spawner carries no
 * model id the way a unit's template does, so the scene reads its
 * variant's entry.
 *
 * ```
 *   standing   the model while it stands
 *   ripe       swapped in while the objective tracking it is in its last
 *              turns before a deadline (the spore pod split open); a
 *              variant without one stays as it is
 * ```
 */
export interface SpawnerModels {
  readonly standing: ModelAssetId;
  readonly ripe?: ModelAssetId;
}

/** Every variant's models. */
export type SpawnerModelCatalogue = Readonly<
  Record<SpawnerVariant, SpawnerModels>
>;
