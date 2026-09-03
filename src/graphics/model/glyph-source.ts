import type { Texture } from "three";

/**
 * Turns single-colour SVG glyphs into textures a sprite material can
 * tint. Scene code depends on this so tests can hand it a fake.
 */
export interface GlyphSource {
  /**
   * Rasterises the SVG at `url` into a white-on-transparent square of
   * `sizePx` pixels. Never rejects: a failure is logged and yields
   * `undefined`, and the caller falls back to primitive markers.
   */
  loadGlyph(url: string, sizePx: number): Promise<Texture | undefined>;
}
