import type { Object3D } from "three";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { ModelAssetEntry } from "./asset-manifest";

/**
 * Resolves model ids to scene objects. Views depend on this, never on
 * three's loaders directly, so a view can be built with a fake in tests.
 */
export interface ModelLoader {
  /**
   * Returns a fresh clone of the model for the caller to own and place.
   * The underlying scene is fetched once per id and cached. Never rejects
   * for a registered id: a failed fetch yields a placeholder instead.
   */
  load(id: ModelAssetId): Promise<Object3D>;

  /** Fetches the given models into the cache so later `load` calls are instant. */
  preload(ids: readonly ModelAssetId[]): Promise<void>;
}

/** Builds a stand-in for a model whose GLB could not be loaded. */
export interface FallbackModelFactory {
  /** Returns a new object sized from the entry, pivot at the base centre. */
  create(id: ModelAssetId, entry: ModelAssetEntry): Object3D;
}
