import type { Texture } from "three";

// ===========================================
// Text textures
// ===========================================

/**
 * Turns a short string into a texture a sprite can wear, so labels can
 * be drawn in the 3D scene without the presentation layer knowing how
 * text is rasterised. The canvas implementation lives in
 * `graphics/service/canvas-text-texture-source.ts`; tests substitute a
 * stub, and a headless environment with no document yields `undefined`,
 * where the caller simply draws no label.
 */
export interface TextTextureSource {
  /** A texture of `text`, or `undefined` when none can be made here. */
  textTexture(text: string): Texture | undefined;
}
