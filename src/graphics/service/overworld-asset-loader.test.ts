import { Group } from "three";
import { describe, expect, it } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import { OVERWORLD_MODEL_IDS } from "../data/overworld-model-table";
import { loadOverworldAssets } from "./overworld-asset-loader";

describe("loadOverworldAssets", () => {
  it("preloads every overworld model and hands the loader on (#1155)", async () => {
    const preloaded: ModelAssetId[] = [];
    const models = {
      load: () => Promise.resolve(new Group()),
      preload: (ids: readonly ModelAssetId[]) => {
        preloaded.push(...ids);
        return Promise.resolve();
      },
    };
    const assets = await loadOverworldAssets({ models });
    expect([...preloaded].sort()).toEqual([...OVERWORLD_MODEL_IDS].sort());
    expect(assets.models).toBe(models);
    // City name labels are rasterised on demand rather than loaded (#439).
    expect(assets.text).toBeDefined();
  });
});
