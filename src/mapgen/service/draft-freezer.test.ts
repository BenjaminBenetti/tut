import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { CoverLevel } from "../model/cover";
import { MapDraft } from "../model/map-draft";
import type { MapRecipe } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "./default-registries";
import { freezeDraft } from "./draft-freezer";
import { TileIndex } from "./tile-index";

const registries = createDefaultRegistries();
const recipe: MapRecipe = {
  seed: "freeze",
  params: {
    archetype: "settlement",
    biome: "temperate",
    settlement: "rural",
    size: { width: 3, depth: 2 },
    hooks: [],
  },
};

function draft(): MapDraft {
  return new MapDraft(3, 2, new SequentialIdGenerator(), SurfaceIds.GRASS);
}

describe("freezeDraft", () => {
  it("materialises uncovered ground at its level and every sparse tile", () => {
    const d = draft();
    d.setGroundLevel(1, 0, 2);
    d.setGroundSurface(2, 1, SurfaceIds.WATER);
    d.setCovered(0, 1);
    d.addTile({
      x: 0,
      y: 0,
      z: 1,
      surface: SurfaceIds.FLOOR,
      buildingId: "b",
      floorIndex: 0,
      roomId: "r",
    });
    d.addTile({ x: 0, y: 1, z: 1, surface: SurfaceIds.ROOF, buildingId: "b" });
    const map = freezeDraft(d, recipe, registries);
    const index = new TileIndex(map);
    expect(map.tiles).toHaveLength(7);
    expect(map.levels).toBe(3);
    expect(index.get(1, 2, 0)?.surface).toBe(SurfaceIds.GRASS);
    expect(index.get(1, 0, 0)).toBeUndefined();
    expect(index.get(2, 0, 1)?.pass).toBe(PassMask.NONE);
    const floor = index.get(0, 0, 1);
    expect(floor?.buildingId).toBe("b");
    expect(floor?.floorIndex).toBe(0);
    expect(floor?.roomId).toBe("r");
    expect(floor?.pass).toBe(PassMask.INFANTRY);
    const roof = index.get(0, 1, 1);
    expect(roof?.surface).toBe(SurfaceIds.ROOF);
    expect("floorIndex" in (roof ?? {})).toBe(false);
    expect(map.recipe).toBe(recipe);
  });

  it("resolves walls, props and cover per tile", () => {
    const d = draft();
    d.setWall({ x: 0, y: 0, z: 0 }, "e", "door");
    d.addProp(PropKindIds.CAR, { x: 2, y: 0, z: 0 }, 3);
    const map = freezeDraft(d, recipe, registries);
    const index = new TileIndex(map);
    expect(index.get(0, 0, 0)?.walls).toEqual({ e: "door" });
    expect(index.get(1, 0, 0)?.walls).toEqual({ w: "door" });
    const car = index.get(2, 0, 0);
    expect(car?.propId).toBe("prop-1");
    expect(car?.pass).toBe(PassMask.NONE);
    expect(car?.coverProvided).toBe(CoverLevel.HIGH);
    expect(car?.blocksLos).toBe(true);
    expect(index.get(1, 0, 1)?.coverProvided).toBe(CoverLevel.NONE);
    expect(index.get(1, 0, 1)?.blocksLos).toBe(false);
    expect(map.props[0]?.rotation).toBe(3);
  });

  it("copies hooks and defaults extraction to the first deploy zone", () => {
    const d = draft();
    const tiles = [{ x: 0, y: 0, z: 0 }];
    d.addHook("deployZones", "deploy", tiles, PassMask.ALL);
    d.addHook(
      "edgeSpawns",
      "edge-spawn",
      [{ x: 2, y: 0, z: 1 }],
      PassMask.INFANTRY,
    );
    const map = freezeDraft(d, recipe, registries);
    expect(map.hooks.deployZones).toHaveLength(1);
    expect(map.hooks.edgeSpawns).toHaveLength(1);
    expect(map.hooks.extraction.kind).toBe("extraction");
    expect(map.hooks.extraction.tiles).toEqual(tiles);

    d.setExtraction([{ x: 1, y: 0, z: 1 }], PassMask.ALL);
    expect(freezeDraft(d, recipe, registries).hooks.extraction.tiles).toEqual([
      { x: 1, y: 0, z: 1 },
    ]);
  });

  it("throws on a surface the registry does not know", () => {
    const d = draft();
    d.setGroundSurface(0, 0, "lava");
    expect(() => freezeDraft(d, recipe, registries)).toThrow(
      'Unknown surface id "lava"',
    );
  });
});
