import { LinearSRGBColorSpace, SRGBColorSpace, Texture } from "three";
import { describe, expect, it, vi } from "vitest";

import { TEXTURE_MANIFEST } from "../data/texture-manifest";
import type { TextureId } from "../data/texture-manifest";
import { ASSET_WARNING_PREFIX } from "../model/asset-logger";
import type { TextureManifest } from "./manifest-texture-loader";
import { ManifestTextureLoader } from "./manifest-texture-loader";

const BASE_URL = "/base/";

const MANIFEST: TextureManifest = {
  ...TEXTURE_MANIFEST,
  "units.bug-atlas": {
    ...TEXTURE_MANIFEST["units.bug-atlas"],
    colorSpace: "linear",
  },
};

function makeLoader(fetchTexture: (url: string) => Promise<Texture>): {
  loader: ManifestTextureLoader;
  warn: ReturnType<typeof vi.fn>;
} {
  const warn = vi.fn();
  const loader = new ManifestTextureLoader({
    manifest: MANIFEST,
    baseUrl: BASE_URL,
    logger: { warn },
    fetchTexture,
  });
  return { loader, warn };
}

describe("ManifestTextureLoader", () => {
  it("fetches the manifest path under the base URL and applies sRGB", async () => {
    const urls: string[] = [];
    const { loader, warn } = makeLoader((url) => {
      urls.push(url);
      return Promise.resolve(new Texture());
    });
    const texture = await loader.loadTexture("overworld.earth-map");
    expect(urls).toEqual([
      `${BASE_URL}${TEXTURE_MANIFEST["overworld.earth-map"].path}`,
    ]);
    expect(texture?.colorSpace).toBe(SRGBColorSpace);
    expect(texture?.name).toBe("overworld.earth-map");
    expect(warn).not.toHaveBeenCalled();
  });

  it("applies linear colour space when the manifest says so", async () => {
    const { loader } = makeLoader(() => Promise.resolve(new Texture()));
    const texture = await loader.loadTexture("units.bug-atlas");
    expect(texture?.colorSpace).toBe(LinearSRGBColorSpace);
  });

  it("fetches each id once and shares the result", async () => {
    const fetchTexture = vi.fn(() => Promise.resolve(new Texture()));
    const { loader } = makeLoader(fetchTexture);
    const [a, b] = await Promise.all([
      loader.loadTexture("overworld.earth-map"),
      loader.loadTexture("overworld.earth-map"),
    ]);
    await loader.loadTexture("overworld.earth-map");
    expect(fetchTexture).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("logs once with the asset prefix and yields undefined when a fetch fails", async () => {
    const fetchTexture = vi.fn(() => Promise.reject(new Error("404")));
    const { loader, warn } = makeLoader(fetchTexture);
    expect(await loader.loadTexture("overworld.earth-map")).toBeUndefined();
    expect(await loader.loadTexture("overworld.earth-map")).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^\\${ASSET_WARNING_PREFIX} .*overworld\\.earth-map.*404`),
      ),
    );
    expect(fetchTexture).toHaveBeenCalledTimes(1);
  });

  it("throws for an id that is not in the manifest", async () => {
    const { loader } = makeLoader(() => Promise.resolve(new Texture()));
    await expect(loader.loadTexture("nope" as TextureId)).rejects.toThrow(
      /not in the manifest/,
    );
  });
});
