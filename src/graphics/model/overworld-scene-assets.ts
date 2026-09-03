import type { Texture } from "three";

/**
 * Art the overworld scene can use when it is available. Every field is
 * optional by design (architecture §7: never block on art): the scene
 * builder substitutes flat colours and primitive markers for anything
 * missing, so a broken asset degrades the look, never the game.
 */
export interface OverworldSceneAssets {
  /** Plate carrée Earth map for the map plane; `undefined` paints flat ocean. */
  readonly mapTexture: Texture | undefined;
  /** White-on-transparent city glyph for marker sprites; `undefined` uses discs. */
  readonly markerGlyph: Texture | undefined;
}

/** No art at all: flat ocean and disc markers. */
export const NO_OVERWORLD_ASSETS: OverworldSceneAssets = {
  mapTexture: undefined,
  markerGlyph: undefined,
};
