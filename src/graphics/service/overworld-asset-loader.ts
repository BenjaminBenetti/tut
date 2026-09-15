import type { GlyphSource } from "../model/glyph-source";
import type { OverworldSceneAssets } from "../model/overworld-scene-assets";
import { CanvasTextTextureSource } from "./canvas-text-texture-source";

// ===========================================
// Types
// ===========================================

/** Where the overworld art comes from. */
export interface OverworldAssetLoaderDeps {
  readonly glyphs: GlyphSource;
  /** Public URL of the city glyph SVG, resolved by the app from the icon manifest. */
  readonly markerGlyphUrl: string;
  /** Public URL of the mission glyph SVG for the active-mission badge. */
  readonly missionGlyphUrl: string;
}

// ===========================================
// Constants
// ===========================================

/**
 * Pixel size the city glyph is rasterised at. The sprite is well under
 * one unit tall, so at the 128 px maximum zoom it never exceeds this.
 */
export const MARKER_GLYPH_RASTER_PX = 128;

// ===========================================
// Loading
// ===========================================

/**
 * Loads every asset the overworld scene can use, in parallel. Never
 * rejects: each source substitutes `undefined` for a failed asset after
 * logging it, and the scene builder falls back per asset. Await this
 * before marking the app ready so a broken path fails the smoke test.
 */
export async function loadOverworldAssets(
  deps: OverworldAssetLoaderDeps,
): Promise<OverworldSceneAssets> {
  const [markerGlyph, missionGlyph] = await Promise.all([
    deps.glyphs.loadGlyph(deps.markerGlyphUrl, MARKER_GLYPH_RASTER_PX),
    deps.glyphs.loadGlyph(deps.missionGlyphUrl, MARKER_GLYPH_RASTER_PX),
  ]);
  return {
    markerGlyph,
    missionGlyph,
    // Labels are rasterised on demand and cached per name (#439).
    text: new CanvasTextTextureSource(),
  };
}
