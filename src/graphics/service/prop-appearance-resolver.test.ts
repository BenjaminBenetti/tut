import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { resolveMapModels } from "./map-model-resolver";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { propBounds } from "../../mapgen/service/prop-footprint";
import {
  propAppearanceScale,
  propModelVariation,
} from "./prop-appearance-resolver";

describe("natural prop appearance", () => {
  it("fits all three full-size vehicles inside their reserved two-tile bounds on both road axes", () => {
    const builder = new FixtureMapBuilder(48, 2, 1).fillGround(0, "road");
    for (let i = 0; i < 24; i++) {
      const tile = { x: i * 2, y: 0, z: 0 };
      const rotation = i % 2 === 0 ? 0 : 1;
      builder.prop("car", tile, rotation, [
        tile,
        {
          ...tile,
          x: tile.x + (rotation === 0 ? 1 : 0),
          z: rotation === 0 ? 0 : 1,
        },
      ]);
    }
    const map = builder.build();
    const before = JSON.stringify(map);
    const models = new Set<string>();
    for (const prop of map.props) {
      const appearance = propModelVariation(prop, map.recipe.seed)!;
      models.add(appearance.modelId);
      const footprint = MODEL_MANIFEST[appearance.modelId].footprint;
      const width = appearance.turns % 2 === 0 ? footprint.w : footprint.d;
      const depth = appearance.turns % 2 === 0 ? footprint.d : footprint.w;
      const bounds = propBounds(prop);
      expect({ w: width, d: depth }).toEqual({ w: bounds.w, d: bounds.d });
      expect(propModelVariation(prop, map.recipe.seed)).toEqual(appearance);
    }
    expect([...models].sort()).toEqual([
      "prop.car-hatchback",
      "prop.car-sedan",
      "prop.car-utility",
    ]);
    expect(resolveMapModels(map).props).toHaveLength(map.props.length);
    for (const placement of resolveMapModels(map).props) {
      const prop = map.props.find((p) => p.tile.x === placement.tile.x)!;
      const bounds = propBounds(prop);
      expect(placement.position.x).toBe(bounds.x + bounds.w / 2);
      expect(placement.position.z).toBe(bounds.z + bounds.d / 2);
    }
    expect(JSON.stringify(map)).toBe(before);
  });
  it("keeps a legacy car compact even though new cars reserve two tiles", () => {
    const prop = {
      id: "old-car",
      kind: "car",
      tile: { x: 3, y: 0, z: 2 },
      rotation: 1 as const,
    };
    expect(propModelVariation(prop, "legacy")).toEqual({
      modelId: "prop.car-compact",
      turns: 1,
    });
  });
  it("keeps solid rocks at their authored sight-blocking height", () => {
    for (const kind of ["boulder", "limestone-outcrop"])
      for (let x = 0; x < 20; x++)
        expect(
          propAppearanceScale(
            { id: "rock", kind, tile: { x, y: 0, z: 0 }, rotation: 0 },
            "rock-heights",
          ).scaleY,
        ).toBe(1);
  });
  it("varies silhouettes deterministically within the authored footprint while retaining ground contact", () => {
    const builder = new FixtureMapBuilder(12, 3, 1).fillGround(0, "grass");
    for (let x = 0; x < 10; x++) builder.prop("tree-oak", { x, y: 0, z: 1 });
    builder.prop("crate", { x: 10, y: 0, z: 1 });
    const map = builder.build();
    const before = JSON.stringify(map);
    const placements = resolveMapModels(map).props;
    const trees = placements.filter((p) => p.modelId === "prop.tree-oak");
    expect(new Set(trees.map((p) => p.scaleY)).size).toBeGreaterThan(5);
    for (const tree of trees) {
      expect(tree.scaleX).toBeGreaterThanOrEqual(0.78);
      expect(tree.scaleX).toBeLessThanOrEqual(1);
      expect(tree.scaleZ).toBe(tree.scaleX);
      expect(tree.scaleY).toBeGreaterThanOrEqual(0.82);
      expect(tree.scaleY).toBeLessThanOrEqual(1.12);
      expect(tree.position.y).toBe(trees[0]!.position.y);
    }
    expect(
      placements.find((p) => p.modelId === "prop.crate")?.scaleY,
    ).toBeUndefined();
    expect(resolveMapModels(map).props).toEqual(placements);
    expect(propAppearanceScale(map.props[0]!, "other-seed")).not.toEqual(
      propAppearanceScale(map.props[0]!, map.recipe.seed),
    );
    expect(JSON.stringify(map)).toBe(before);
  });
});
