import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { resolveMapModels } from "./map-model-resolver";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { propBounds } from "../../mapgen/service/prop-footprint";
import { PropKindIds } from "../../mapgen/data/props";
import { DEAD_TREE_MODELS } from "../data/dead-tree-models";
import { propModel } from "../data/map-model-table";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import {
  propAppearanceScale,
  propModelVariation,
} from "./prop-appearance-resolver";

describe("natural prop appearance", () => {
  it("removes foliage from every tree species on infested ground, including low-pressure edges", () => {
    const kinds = Object.values(PropKindIds).filter(
      (kind) =>
        kind.startsWith("tree-") ||
        kind === PropKindIds.BANKSIA ||
        kind === PropKindIds.GRASS_TREE,
    );
    const builder = new FixtureMapBuilder(kinds.length, 2, 1).fillGround();
    for (const [x, kind] of kinds.entries()) {
      builder.prop(kind, { x, y: 0, z: 0 }, 1);
      builder.prop(kind, { x, y: 0, z: 1 }, 3);
    }
    const clean = builder.build();
    const living = resolveMapModels(clean).props;
    for (const pressure of [0.01, 1]) {
      const map: TacticalMap = {
        ...clean,
        recipe: {
          ...clean.recipe,
          params: { ...clean.recipe.params, infestation: 10 },
        },
        tiles: clean.tiles.map((tile) =>
          tile.z === 0 ? { ...tile, surface: "infested" } : tile,
        ),
        infestation: {
          level: 10,
          zones: [],
          corridors: [],
          ruins: [],
          influence: Array<number>(kinds.length * 2).fill(pressure),
        },
      };
      const before = JSON.stringify(map);
      const resolved = resolveMapModels(map).props;
      for (const [index, tree] of resolved.entries()) {
        const original = living[index]!;
        const dead = DEAD_TREE_MODELS[original.modelId];
        expect(dead, original.modelId).toBeDefined();
        expect(tree).toEqual({
          ...original,
          modelId: tree.tile.z === 0 ? dead : original.modelId,
        });
      }
      expect(resolveMapModels(map).props).toEqual(resolved);
      expect(JSON.stringify(map)).toBe(before);
    }
    for (const kind of kinds) {
      const live = propModel(kind)!;
      expect(MODEL_MANIFEST[DEAD_TREE_MODELS[live]!].footprint).toEqual(
        MODEL_MANIFEST[live].footprint,
      );
    }
  });

  it("uses the tree's supporting surface on raised ground and in maps without colony metadata", () => {
    const map = new FixtureMapBuilder(4, 4, 5)
      .fillGround(3, "infested")
      .prop("tree-pine", { x: 1, y: 3, z: 1 }, 2)
      .prop("boulder", { x: 2, y: 3, z: 1 })
      .build();
    expect(map.infestation).toBeUndefined();
    const props = resolveMapModels(map).props;
    expect(props[0]).toMatchObject({
      modelId: "prop.tree-pine-dead",
      turns: 2,
      level: 3,
      tile: { x: 1, y: 3, z: 1 },
    });
    expect(props[1]?.modelId).toBe("prop.boulder");
  });

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
