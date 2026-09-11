import { describe, expect, it } from "vitest";
import type { PlaceProfileId } from "../../content/model/place-profile-id";
import { DEFAULT_MISSION_HOOKS } from "../../mapgen/data/hook-requirements";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { resolveMapModels } from "./map-model-resolver";

/** Selects a graphics profile without changing any generated tiles or objects. */
function profiled(
  map: TacticalMap,
  placeProfile?: PlaceProfileId,
): TacticalMap {
  return {
    ...map,
    recipe: { ...map.recipe, params: { ...map.recipe.params, placeProfile } },
  };
}

describe("Johannesburg building finishes (#1084)", () => {
  it.each(["solid", "window", "door"] as const)(
    "uses the same finish for a %s ground wall drawn by the outside tile and its upper storey",
    (kind) => {
      const b = new FixtureMapBuilder(6, 6, 3).fillGround();
      b.tile({ x: 2, y: 0, z: 2 }, "floor", { buildingId: "building-1" });
      b.tile({ x: 2, y: 2, z: 2 }, "floor", { buildingId: "building-1" });
      b.wall({ x: 2, y: 0, z: 2 }, "s", kind);
      b.wall({ x: 2, y: 2, z: 2 }, "s", kind);
      // A civic edge next to that building must still use its kerb-and-rail kit.
      b.wall({ x: 2, y: 0, z: 2 }, "e", "half");
      const plain = b.build();
      const original = JSON.stringify(plain);
      const before = resolveMapModels(plain).walls;
      const after = resolveMapModels(profiled(plain, "johannesburg")).walls;
      const finish =
        kind === "solid"
          ? "building.wall-plaster"
          : `building.wall-${kind}-plaster`;
      const plaster = after.filter((p) => p.modelId === finish);
      expect(plaster).toHaveLength(2);
      expect(plaster.map((p) => p.level).sort()).toEqual([0, 2]);
      expect(after.some((p) => p.modelId === "building.viaduct-parapet")).toBe(
        true,
      );
      expect(after.map(({ modelId: _id, ...p }) => p)).toEqual(
        before.map(({ modelId: _id, ...p }) => p),
      );
      expect(JSON.stringify(plain)).toBe(original);
    },
  );

  it.each(["730982385", "1892582247"])(
    "broadens seed %s without changing its building, access or terrain records",
    (seed) => {
      const plain = generateTacticalMap({
        seed,
        params: {
          archetype: "settlement",
          biome: "temperate",
          settlement: "city",
          size: seed === "730982385" ? "small" : "medium",
          hooks: DEFAULT_MISSION_HOOKS,
          slopeShare: 1,
        },
      });
      const local = profiled(plain, "johannesburg");
      const original = JSON.stringify(local);
      const before = resolveMapModels(plain),
        after = resolveMapModels(local);
      expect(
        after.roofs.some((p) => p.modelId === "building.roof-hipped"),
      ).toBe(true);
      expect(
        after.roofs.some((p) => p.modelId === "building.roof-pitched"),
      ).toBe(true);
      expect(
        after.walls.some((p) => p.modelId === "building.wall-plaster"),
      ).toBe(true);
      expect(after.walls.some((p) => p.modelId === "building.wall")).toBe(true);
      expect(
        after.roofs.map(
          ({ modelId: _id, roof: _roof, turns: _turns, ...p }) => p,
        ),
      ).toEqual(
        before.roofs.map(
          ({ modelId: _id, roof: _roof, turns: _turns, ...p }) => p,
        ),
      );
      expect(after.tiles).toEqual(before.tiles);
      expect(after.foundations).toEqual(before.foundations);
      expect(after.frontages).toEqual(before.frontages);
      expect(after.props).toEqual(before.props);
      expect(after.connectors.map(({ ladder: _ladder, ...p }) => p)).toEqual(
        before.connectors.map(({ ladder: _ladder, ...p }) => p),
      );
      expect(JSON.stringify(local)).toBe(original);
    },
  );

  it("leaves Perth's entire placement set on its established renderer path", () => {
    const map = generateTacticalMap({
      seed: "215428772",
      params: {
        archetype: "settlement",
        biome: "coastal",
        settlement: "town",
        size: "medium",
        placeProfile: "perth",
        hooks: DEFAULT_MISSION_HOOKS,
        slopeShare: 1,
      },
    });
    expect(resolveMapModels(map)).toEqual(resolveMapModels(profiled(map)));
  });
});
