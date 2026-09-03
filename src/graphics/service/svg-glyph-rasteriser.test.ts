import { SRGBColorSpace, Texture } from "three";
import { describe, expect, it, vi } from "vitest";

import { ASSET_WARNING_PREFIX } from "../model/asset-logger";
import {
  looksLikeSvg,
  SvgGlyphRasteriser,
  whitenSvg,
} from "./svg-glyph-rasteriser";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor"><path d="M0 0"/></svg>';

function makeRasteriser(options: {
  fetchSvg?: (url: string) => Promise<string>;
  rasterise?: (svg: string, sizePx: number) => Promise<Texture>;
}): { rasteriser: SvgGlyphRasteriser; warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn();
  const rasteriser = new SvgGlyphRasteriser({
    logger: { warn },
    fetchSvg: options.fetchSvg ?? (() => Promise.resolve(SVG)),
    rasterise: options.rasterise ?? (() => Promise.resolve(new Texture())),
  });
  return { rasteriser, warn };
}

describe("whitenSvg", () => {
  it("replaces every currentColor with white", () => {
    expect(whitenSvg('<a stroke="currentColor" fill="currentColor"/>')).toBe(
      '<a stroke="#ffffff" fill="#ffffff"/>',
    );
  });
});

describe("looksLikeSvg", () => {
  it("accepts SVG and rejects an HTML fallback page", () => {
    expect(looksLikeSvg(SVG)).toBe(true);
    expect(looksLikeSvg("<!doctype html><html></html>")).toBe(false);
  });
});

describe("SvgGlyphRasteriser", () => {
  it("whitens before rasterising and tags the texture", async () => {
    const seen: [string, number][] = [];
    const { rasteriser, warn } = makeRasteriser({
      rasterise: (svg, size) => {
        seen.push([svg, size]);
        return Promise.resolve(new Texture());
      },
    });
    const texture = await rasteriser.loadGlyph("/icons/marker-city.svg", 128);
    expect(seen).toEqual([[whitenSvg(SVG), 128]]);
    expect(texture?.colorSpace).toBe(SRGBColorSpace);
    expect(texture?.name).toBe("/icons/marker-city.svg");
    expect(warn).not.toHaveBeenCalled();
  });

  it("caches per URL and size", async () => {
    const fetchSvg = vi.fn(() => Promise.resolve(SVG));
    const { rasteriser } = makeRasteriser({ fetchSvg });
    const a = await rasteriser.loadGlyph("/a.svg", 64);
    const b = await rasteriser.loadGlyph("/a.svg", 64);
    await rasteriser.loadGlyph("/a.svg", 128);
    expect(a).toBe(b);
    expect(fetchSvg).toHaveBeenCalledTimes(2);
  });

  it("logs with the asset prefix and yields undefined when the fetch fails", async () => {
    const { rasteriser, warn } = makeRasteriser({
      fetchSvg: () => Promise.reject(new Error("HTTP 404")),
    });
    expect(await rasteriser.loadGlyph("/missing.svg", 64)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^\\${ASSET_WARNING_PREFIX} .*missing\\.svg.*HTTP 404`),
      ),
    );
  });

  it("treats a non-SVG response as a failure", async () => {
    const { rasteriser, warn } = makeRasteriser({
      fetchSvg: () => Promise.resolve("<!doctype html><html></html>"),
    });
    expect(await rasteriser.loadGlyph("/fallback.svg", 64)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
