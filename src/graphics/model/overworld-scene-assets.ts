import type { Texture } from "three";

import type { TextTextureSource } from "./text-texture-source";

/**
 * Art the overworld scene can use when it is available. Every field is
 * optional by design (architecture §7: never block on art): the scene
 * builder substitutes primitive markers for anything missing, so a
 * broken asset degrades the look, never the game. The Earth itself is
 * not art: it is drawn from coastline data (#1144).
 */
export interface OverworldSceneAssets {
  /** White-on-transparent city glyph for marker sprites; `undefined` uses discs. */
  readonly markerGlyph: Texture | undefined;
  /** White-on-transparent mission glyph for the active-mission badge; `undefined` uses a small disc. */
  readonly missionGlyph: Texture | undefined;
  /**
   * Rasterises city names for their labels (#439); absent draws no
   * label, which is what the headless sim and node tests get.
   */
  readonly text?: TextTextureSource | undefined;
}

/** No art at all: disc markers. */
export const NO_OVERWORLD_ASSETS: OverworldSceneAssets = {
  markerGlyph: undefined,
  missionGlyph: undefined,
  text: undefined,
};
