import { describe, expect, it } from "vitest";
import { INFESTED_MODEL_VARIANTS } from "../data/infested-model-variants";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { resolveMapModels, type ModelPlacement } from "./map-model-resolver";
import { infestModel } from "./infested-model-resolver";
import type { ModelAssetId } from "../../content/data/model-ids";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { PROP_MODEL_VARIANTS } from "../data/prop-model-variants";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { PROP_DEFINITIONS } from "../../mapgen/data/props";

const baseline = new FixtureMapBuilder(8, 8, 1).fillGround().build();

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

/** Full local pressure at one end and a genuinely clean district at the other. */
function colonyMap(): TacticalMap {
  return {
    ...baseline,
    recipe: {
      ...baseline.recipe,
      params: { ...baseline.recipe.params, infestation: 10 },
    },
    infestation: {
      level: 10,
      zones: [],
      corridors: [],
      ruins: [],
      influence: Array.from({ length: 64 }, (_, i) => (i % 8 < 4 ? 1 : 0)),
    },
  };
}

describe("infested asset resolution", () => {
  it("uses local colony pressure, so a clean district remains clean even at level ten", () => {
    const map = colonyMap();
    for (const [modelId, variant] of Object.entries(INFESTED_MODEL_VARIANTS)) {
      const base = placement(modelId as ModelAssetId);
      expect(infestModel(base, baseline)).toBe(base);
      expect(infestModel(base, map).modelId).toBe(
        modelId === "building.wall"
          ? "building.wall-brick-breached"
          : variant.modelId,
      );
      const clean = placement(modelId as ModelAssetId, 7);
      expect(infestModel(clean, map)).toBe(clean);
    }
  });

  it("preserves the authored orientation and footprint of every replacement", () => {
    for (const [modelId, variant] of Object.entries(INFESTED_MODEL_VARIANTS)) {
      const base = { ...placement(modelId as ModelAssetId), turns: 1 as const };
      expect(infestModel(base, colonyMap()).turns).toBe(1);
      expect(MODEL_MANIFEST[variant.modelId].footprint).toEqual(
        MODEL_MANIFEST[modelId as ModelAssetId].footprint,
      );
    }
  });

  it("keeps every colony organism variant inside its gameplay footprint", () => {
    for (const definition of PROP_DEFINITIONS.filter((d) =>
      d.id.startsWith("infested-"),
    )) {
      for (const variant of PROP_MODEL_VARIANTS[definition.id] ?? []) {
        const footprint = MODEL_MANIFEST[variant.modelId].footprint;
        expect(footprint, variant.modelId).toEqual(
          definition.footprint ?? { w: 1, d: 1 },
        );
      }
    }
  });

  it("resolves varied resin terrain and physical nests without changing simulation data", () => {
    const map = new FixtureMapBuilder(8, 8, 1)
      .fillGround(0, "infested")
      .prop("infested-nest", { x: 1, y: 0, z: 1 })
      .build();
    const before = JSON.stringify(map);
    const models = resolveMapModels(map);
    expect(
      models.tiles.every((tile) =>
        tile.modelId.startsWith("tile.ground.infested"),
      ),
    ).toBe(true);
    expect(
      new Set(models.tiles.map((tile) => tile.modelId)).size,
    ).toBeGreaterThan(2);
    expect(
      models.props.some((prop) => prop.modelId === "prop.infested-nest"),
    ).toBe(true);
    expect(JSON.stringify(map)).toBe(before);
    expect(resolveMapModels(map)).toEqual(models);
  });
});
