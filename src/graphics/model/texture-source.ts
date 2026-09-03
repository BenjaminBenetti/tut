import type { Texture } from "three";

import type { TextureId } from "../data/texture-manifest";

/**
 * Resolves texture ids to loaded textures. Scene code depends on this,
 * never on three's loaders, so a scene can be built with a fake or with
 * no textures at all in tests.
 */
export interface TextureSource {
  /**
   * Loads a registered texture once and caches it. Never rejects for a
   * registered id: a failed fetch is logged and yields `undefined`, and
   * the caller falls back to flat colours.
   */
  loadTexture(id: TextureId): Promise<Texture | undefined>;
}
