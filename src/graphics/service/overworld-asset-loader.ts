import { OVERWORLD_MODEL_IDS } from "../data/overworld-model-table";
import type { ModelLoader } from "../model/model-loader";
import type { OverworldSceneAssets } from "../model/overworld-scene-assets";
import { CanvasTextTextureSource } from "./canvas-text-texture-source";

// ===========================================
// Types
// ===========================================

/** Where the overworld art comes from. */
export interface OverworldAssetLoaderDeps {
  /** Resolves the settlement, egg-overlay and installation GLBs (#1155). */
  readonly models: ModelLoader;
}

// ===========================================
// Loading
// ===========================================

/**
 * Loads every asset the overworld scene can use. The models are
 * preloaded so the first frame stands every settlement up rather than
 * popping them in one by one; the loader never rejects for a
 * registered id, substituting a placeholder for a GLB that fails and
 * logging it, so a broken path degrades the look and fails the smoke
 * test's console check rather than the app. Await this before marking
 * the app ready.
 */
export async function loadOverworldAssets(
  deps: OverworldAssetLoaderDeps,
): Promise<OverworldSceneAssets> {
  await deps.models.preload(OVERWORLD_MODEL_IDS);
  return {
    models: deps.models,
    // Labels are rasterised on demand and cached per name (#439).
    text: new CanvasTextTextureSource(),
  };
}
