import { describe, expect, it } from "vitest";
import { INFESTED_MODEL_VARIANTS } from "../data/infested-model-variants";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { resolveMapModels, type ModelPlacement } from "./map-model-resolver";
import { infestModel } from "./infested-model-resolver";
import type { ModelAssetId } from "../../content/data/model-ids";

const recipe = new FixtureMapBuilder(8, 8, 1).fillGround().build().recipe;

/** One physical placement shared by baseline and infested art. */
function placement(modelId: ModelAssetId, x = 0): ModelPlacement {
  return {
    modelId,
    position: { x, y: 0, z: 0 },
    tile: { x, y: 0, z: 0 },
    level: 0,
    turns: 0,
  };
}

describe("infested asset resolution", () => {
  it("leaves clean recipes unchanged and swaps every supported asset at ten", () => {
    for (const [modelId, variant] of Object.entries(INFESTED_MODEL_VARIANTS)) {
      const base = placement(modelId as ModelAssetId);
      expect(infestModel(base, recipe)).toBe(base);
      expect(
        infestModel(base, {
          ...recipe,
          params: { ...recipe.params, infestation: 10 },
        }).modelId,
      ).toBe(variant.modelId);
    }
  });

  it("keeps swaps stable and cumulative as infestation rises", () => {
    let previous = 0;
    for (let infestation = 0; infestation <= 10; infestation++) {
      const infested = { ...recipe, params: { ...recipe.params, infestation } };
      const count = Array.from({ length: 100 }, (_, x) =>
        infestModel(placement("prop.lamp-post", x), infested),
      ).filter((p) => p.modelId === "prop.lamp-post-infested").length;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    expect(previous).toBe(100);
  });

  it("preserves the orientation of cars authored on the alternate axis", () => {
    const base = { ...placement("prop.car-hatchback"), turns: 1 as const };
    expect(
      infestModel(base, {
        ...recipe,
        params: { ...recipe.params, infestation: 10 },
      }),
    ).toMatchObject({ modelId: "prop.car-infested", turns: 0 });
  });

  it("resolves infested ground and spike nests through registered art", () => {
    const map = new FixtureMapBuilder(3, 3, 1)
      .fillGround(0, "infested")
      .prop("infested-nest", { x: 1, y: 0, z: 1 })
      .build();
    const models = resolveMapModels(map);
    expect(
      models.tiles.every((tile) => tile.modelId === "tile.ground.infested"),
    ).toBe(true);
    expect(
      models.props.some((prop) => prop.modelId === "prop.infested-nest"),
    ).toBe(true);
  });
});
