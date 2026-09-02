import type { Texture } from "three";
import { CanvasTexture, SRGBColorSpace } from "three";

import type { AssetLogger } from "../model/asset-logger";
import { ASSET_WARNING_PREFIX } from "../model/asset-logger";
import type { GlyphSource } from "../model/glyph-source";

// ===========================================
// Types
// ===========================================

/** Fetches an SVG document's text by URL. */
export type SvgFetchFn = (url: string) => Promise<string>;

/** Draws SVG text into a square texture of `sizePx` pixels. */
export type SvgRasteriseFn = (svg: string, sizePx: number) => Promise<Texture>;

/** What the rasteriser is composed from. */
export interface SvgGlyphRasteriserOptions {
  readonly logger: AssetLogger;
  /** Replaces `fetch`; tests inject a fake here. */
  readonly fetchSvg?: SvgFetchFn;
  /** Replaces the canvas rasteriser; tests inject a fake here. */
  readonly rasterise?: SvgRasteriseFn;
}

// ===========================================
// Pure helpers
// ===========================================

/**
 * Rewrites `currentColor` to white so the glyph rasterises as a white
 * shape on transparency and a material's `color` can tint it. The
 * icons are authored with `stroke="currentColor"` (style guide §5).
 */
export function whitenSvg(svg: string): string {
  return svg.replaceAll("currentColor", "#ffffff");
}

/** True when the text looks like an SVG document rather than, say, an HTML fallback page. */
export function looksLikeSvg(text: string): boolean {
  return text.includes("<svg");
}

// ===========================================
// SvgGlyphRasteriser
// ===========================================

/**
 * `GlyphSource` that fetches a manifest icon, whitens it, and draws it
 * onto a canvas at the requested size so the sprite stays crisp when the
 * camera zooms in. Results are cached per URL and size. Any failure,
 * including the dev server answering a missing file with `index.html`,
 * is logged with the asset prefix and yields `undefined`.
 */
export class SvgGlyphRasteriser implements GlyphSource {
  // ===========================================
  // Fields
  // ===========================================

  private readonly logger: AssetLogger;
  private readonly fetchSvg: SvgFetchFn;
  private readonly rasterise: SvgRasteriseFn;
  private readonly cache = new Map<string, Promise<Texture | undefined>>();

  // ===========================================
  // Constructor
  // ===========================================

  /** Wires the rasteriser; nothing is fetched until `loadGlyph`. */
  constructor(options: SvgGlyphRasteriserOptions) {
    this.logger = options.logger;
    this.fetchSvg = options.fetchSvg ?? fetchSvgText;
    this.rasterise = options.rasterise ?? rasteriseSvg;
  }

  // ===========================================
  // GlyphSource
  // ===========================================

  /** The cached glyph texture for a URL and size, produced on first request. */
  loadGlyph(url: string, sizePx: number): Promise<Texture | undefined> {
    const key = `${url}@${sizePx}`;
    let pending = this.cache.get(key);
    if (pending === undefined) {
      pending = this.produce(url, sizePx);
      this.cache.set(key, pending);
    }
    return pending;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Fetches, validates, whitens and rasterises, or logs once. */
  private async produce(
    url: string,
    sizePx: number,
  ): Promise<Texture | undefined> {
    try {
      const svg = await this.fetchSvg(url);
      if (!looksLikeSvg(svg)) {
        throw new Error("response is not an SVG document");
      }
      const texture = await this.rasterise(whitenSvg(svg), sizePx);
      texture.colorSpace = SRGBColorSpace;
      texture.name = url;
      return texture;
    } catch (error: unknown) {
      this.logger.warn(
        `${ASSET_WARNING_PREFIX} Glyph failed to load from ${url}; using disc markers. ${describeError(error)}`,
      );
      return undefined;
    }
  }
}

// ===========================================
// Browser helpers
// ===========================================

/** The production `SvgFetchFn`: `fetch` with a status check. */
async function fetchSvgText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

/**
 * The production `SvgRasteriseFn`: decodes the SVG as an image and draws
 * it scaled onto a canvas, which the browser rasterises at the drawn
 * size rather than the SVG's nominal 24 px.
 */
async function rasteriseSvg(svg: string, sizePx: number): Promise<Texture> {
  const objectUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image(sizePx, sizePx);
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = sizePx;
    canvas.height = sizePx;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D canvas is unavailable");
    }
    context.drawImage(image, 0, 0, sizePx, sizePx);
    return new CanvasTexture(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Renders whatever was thrown as one line for the log. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
