import { Texture } from "three";
import { describe, expect, it } from "vitest";

import {
  loadOverworldAssets,
  MARKER_GLYPH_RASTER_PX,
} from "./overworld-asset-loader";

describe("loadOverworldAssets", () => {
  it("asks for the Earth map and both glyphs and bundles what came back", async () => {
    const map = new Texture();
    const glyph = new Texture();
    const asked: string[] = [];
    const assets = await loadOverworldAssets({
      textures: {
        loadTexture: (id) => {
          asked.push(`texture:${id}`);
          return Promise.resolve(map);
        },
      },
      glyphs: {
        loadGlyph: (url, size) => {
          asked.push(`glyph:${url}@${size}`);
          return Promise.resolve(glyph);
        },
      },
      markerGlyphUrl: "/icons/marker-city.svg",
      missionGlyphUrl: "/icons/mission.svg",
    });
    expect(asked.sort()).toEqual([
      `glyph:/icons/marker-city.svg@${MARKER_GLYPH_RASTER_PX}`,
      `glyph:/icons/mission.svg@${MARKER_GLYPH_RASTER_PX}`,
      "texture:overworld.earth-map",
    ]);
    expect(assets).toMatchObject({
      mapTexture: map,
      markerGlyph: glyph,
      missionGlyph: glyph,
    });
    // City name labels are rasterised on demand rather than loaded (#439).
    expect(assets.text).toBeDefined();
  });

  it("passes missing assets through as undefined", async () => {
    const assets = await loadOverworldAssets({
      textures: { loadTexture: () => Promise.resolve(undefined) },
      glyphs: { loadGlyph: () => Promise.resolve(undefined) },
      markerGlyphUrl: "/icons/marker-city.svg",
      missionGlyphUrl: "/icons/marker-city.svg",
    });
    expect(assets).toMatchObject({
      mapTexture: undefined,
      markerGlyph: undefined,
      missionGlyph: undefined,
    });
  });
});
