import type { Texture } from "three";

import type { SpriteId } from "../data/sprite-manifest";

/**
 * Loads VFX sprites by manifest id. Presentation depends on this rather
 * than on paths, so the frame sheets from #395 can replace the stills
 * without touching the animation code.
 */
export interface SpriteSource {
  /**
   * Loads a registered sprite once and caches it. Never rejects for a
   * registered id: a failed fetch is logged and yields `undefined`, and
   * the caller draws a flat-colour billboard instead.
   */
  loadSprite(id: SpriteId): Promise<Texture | undefined>;
}
