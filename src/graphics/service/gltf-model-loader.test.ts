import type { Object3D } from "three";
import { Group, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import { MODEL_MANIFEST } from "../data/model-manifest";
import type { ModelManifest } from "../model/asset-manifest";
import type { FallbackModelFactory } from "../model/model-loader";
import type { SceneLoadFn } from "./gltf-model-loader";
import { GltfModelLoader } from "./gltf-model-loader";

const BASE_URL = "/base/";

/** A fake GLB scene: a group holding one mesh, so clones have structure to check. */
function fakeScene(): Object3D {
  const group = new Group();
  group.add(new Mesh());
  return group;
}

/** Builds a loader around spies for the scene fetch, the fallback and the logger. */
function createLoader(
  loadScene: SceneLoadFn,
  manifest: ModelManifest = MODEL_MANIFEST,
) {
  const create = vi.fn((id: ModelAssetId) => {
    const stub = new Group();
    stub.name = `fallback:${id}`;
    return stub;
  });
  const fallback: FallbackModelFactory = { create };
  const warn = vi.fn();
  const loadSceneSpy = vi.fn(loadScene);
  const loader = new GltfModelLoader({
    manifest,
    baseUrl: BASE_URL,
    fallback,
    logger: { warn },
    loadScene: loadSceneSpy,
  });
  return { loader, loadScene: loadSceneSpy, create, warn };
}

describe("GltfModelLoader", () => {
  it("fetches an id once and hands out distinct clones", async () => {
    const { loader, loadScene } = createLoader(() =>
      Promise.resolve(fakeScene()),
    );
    const first = await loader.load("bug.swarmer");
    const second = await loader.load("bug.swarmer");
    expect(loadScene).toHaveBeenCalledTimes(1);
    expect(first).not.toBe(second);
    expect(first.children).toHaveLength(1);
    expect(second.children).toHaveLength(1);
    expect(first.children[0]).not.toBe(second.children[0]);
    expect(first.name).toBe("bug.swarmer");
  });

  it("dedupes concurrent loads of the same id", async () => {
    const { loader, loadScene } = createLoader(() =>
      Promise.resolve(fakeScene()),
    );
    await Promise.all([loader.load("bug.brute"), loader.load("bug.brute")]);
    expect(loadScene).toHaveBeenCalledTimes(1);
  });

  it("resolves the URL from the base URL and the manifest path", async () => {
    const { loader, loadScene } = createLoader(() =>
      Promise.resolve(fakeScene()),
    );
    await loader.load("prop.crate");
    expect(loadScene).toHaveBeenCalledWith(
      `${BASE_URL}${MODEL_MANIFEST["prop.crate"].path}`,
    );
  });

  it("falls back to the placeholder and warns once when the fetch fails", async () => {
    const { loader, create, warn } = createLoader(() =>
      Promise.reject(new Error("404")),
    );
    const first = await loader.load("tile.ground.grass");
    const second = await loader.load("tile.ground.grass");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      "tile.ground.grass",
      MODEL_MANIFEST["tile.ground.grass"],
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("tile.ground.grass"),
    );
    expect(first.name).toBe("fallback:tile.ground.grass");
    expect(second.name).toBe("fallback:tile.ground.grass");
    expect(first).not.toBe(second);
  });

  it("preloads each id once so later loads reuse the cache", async () => {
    const { loader, loadScene } = createLoader(() =>
      Promise.resolve(fakeScene()),
    );
    await loader.preload(["bug.swarmer", "bug.lurker", "bug.swarmer"]);
    expect(loadScene).toHaveBeenCalledTimes(2);
    await loader.load("bug.lurker");
    expect(loadScene).toHaveBeenCalledTimes(2);
  });

  it("rejects an id that has no manifest entry", async () => {
    const { loader, loadScene } = createLoader(
      () => Promise.resolve(fakeScene()),
      {} as ModelManifest,
    );
    await expect(loader.load("bug.swarmer")).rejects.toThrow(/bug\.swarmer/);
    expect(loadScene).not.toHaveBeenCalled();
  });
});
