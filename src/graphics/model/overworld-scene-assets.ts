import type { ModelLoader } from "./model-loader";
import type { TextTextureSource } from "./text-texture-source";

/**
 * Art the overworld scene can use when it is available. Every field is
 * optional by design (architecture §7: never block on art): the scene
 * builder substitutes primitives for anything missing, so a broken
 * asset degrades the look, never the game. The Earth itself is not art:
 * it is drawn from coastline data (#1144). Cities and installations are
 * GLB models since #1155, resolved through the shared model loader,
 * which hands out a placeholder box for a GLB that fails to load.
 */
export interface OverworldSceneAssets {
  /**
   * Resolves settlement, egg-overlay and installation models by id;
   * `undefined` (the headless sim, node tests) draws stand-in blocks.
   */
  readonly models: ModelLoader | undefined;
  /**
   * Rasterises city names for their labels (#439); absent draws no
   * label, which is what the headless sim and node tests get.
   */
  readonly text?: TextTextureSource | undefined;
}

/** No art at all: stand-in blocks and no labels. */
export const NO_OVERWORLD_ASSETS: OverworldSceneAssets = {
  models: undefined,
  text: undefined,
};
