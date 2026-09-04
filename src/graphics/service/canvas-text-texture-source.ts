import type { Texture } from "three";
import { CanvasTexture, SRGBColorSpace } from "three";

import type { TextTextureSource } from "../model/text-texture-source";

// ===========================================
// Constants
// ===========================================

/** Height of the rasterised strip, in pixels; width follows the text. */
const HEIGHT = 64;

/** Font the label is drawn in, matching the UI's mono stack. */
const FONT = "500 34px ui-monospace, SFMono-Regular, Menlo, monospace";

/** Padding either side of the text, in pixels. */
const PADDING = 14;

/** Label fill and its backing plate: `ui-text` on a dark, mostly opaque slab. */
const TEXT_COLOUR = "#e8ecf4";
const PLATE_COLOUR = "rgba(11, 13, 18, 0.82)";

// ===========================================
// CanvasTextTextureSource
// ===========================================

/**
 * Rasterises label text onto a canvas, cached per string so the same
 * city name is drawn once however often it is shown. Yields `undefined`
 * where there is no document (node tests, the headless sim), so callers
 * draw no label rather than crashing.
 */
export class CanvasTextTextureSource implements TextTextureSource {
  // ===========================================
  // Fields
  // ===========================================

  private readonly cache = new Map<string, Texture | undefined>();

  // ===========================================
  // TextTextureSource
  // ===========================================

  /** The cached texture for `text`, rasterised on first request. */
  textTexture(text: string): Texture | undefined {
    let texture = this.cache.get(text);
    if (texture === undefined && !this.cache.has(text)) {
      texture = rasterise(text);
      this.cache.set(text, texture);
    }
    return texture;
  }

  /** Frees every texture this source made. */
  dispose(): void {
    for (const texture of this.cache.values()) {
      texture?.dispose();
    }
    this.cache.clear();
  }
}

// ===========================================
// Helpers
// ===========================================

/** Draws `text` on a transparent plate, or `undefined` without a document. */
function rasterise(text: string): Texture | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) {
    return undefined;
  }
  measure.font = FONT;
  const width = Math.ceil(measure.measureText(text).width) + PADDING * 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return undefined;
  }
  ctx.fillStyle = PLATE_COLOUR;
  ctx.fillRect(0, 0, width, HEIGHT);
  ctx.font = FONT;
  ctx.fillStyle = TEXT_COLOUR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, HEIGHT / 2 + 1);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.name = `label:${text}`;
  return texture;
}

/** Aspect ratio of a rasterised label, for sizing the sprite that wears it. */
export function labelAspect(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number } | null;
  const width = image?.width ?? HEIGHT;
  const height = image?.height ?? HEIGHT;
  return height > 0 ? width / height : 1;
}
