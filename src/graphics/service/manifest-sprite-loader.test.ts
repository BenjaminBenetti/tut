import { SRGBColorSpace, Texture } from "three";
import { describe, expect, it } from "vitest";

import { SPRITE_MANIFEST } from "../data/sprite-manifest";
import { ManifestSpriteLoader } from "./manifest-sprite-loader";

const quiet = { warn: () => undefined };

describe("ManifestSpriteLoader", () => {
  it("resolves manifest ids to base-prefixed urls, marks sprites sRGB and caches them", async () => {
    const asked: string[] = [];
    const loader = new ManifestSpriteLoader({
      manifest: SPRITE_MANIFEST,
      baseUrl: "/tut/",
      logger: quiet,
      fetchTexture: (url) => {
        asked.push(url);
        return Promise.resolve(new Texture());
      },
    });
    const first = await loader.loadSprite("vfx.impact");
    const again = await loader.loadSprite("vfx.impact");
    expect(asked).toEqual([`/tut/${SPRITE_MANIFEST["vfx.impact"].path}`]);
    expect(first).toBe(again);
    expect(first?.colorSpace).toBe(SRGBColorSpace);
    expect(first?.name).toBe("vfx.impact");
  });

  it("logs and yields undefined when a sprite fails to load", async () => {
    const warnings: string[] = [];
    const loader = new ManifestSpriteLoader({
      manifest: SPRITE_MANIFEST,
      baseUrl: "/",
      logger: { warn: (m) => warnings.push(m) },
      fetchTexture: () => Promise.reject(new Error("404")),
    });
    expect(await loader.loadSprite("vfx.muzzle-flash")).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("vfx.muzzle-flash");
  });
});
