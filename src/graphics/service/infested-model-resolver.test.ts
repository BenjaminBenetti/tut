import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { resolveMapModels } from "./map-model-resolver";
import {
  infestedModelStage,
  resolveInfestedModels,
} from "./infested-model-resolver";
import { takesGhostCutaway } from "./ghost-cutaway-eligibility";

/** Keep the layout fixed while changing infection coverage and maturity. */
function infected(map: TacticalMap, level: number): TacticalMap {
  return {
    ...map,
    recipe: {
      ...map.recipe,
      params: { ...map.recipe.params, infestationLevel: level },
    },
    tiles: map.tiles.map((tile) => ({ ...tile, infested: true })),
  };
}

describe("complete infested host variants", () => {
  it("retains exact host transforms, ownership and cutaway through all three stages", () => {
    const builder = new FixtureMapBuilder(4, 3, 1).fillGround();
    builder.wall({ x: 1, y: 0, z: 1 }, "n", "door");
    builder.prop("tree-oak", { x: 2, y: 0, z: 1 });
    const clean = builder.build();
    const base = resolveMapModels(clean);
    for (const level of [1, 4, 7, 10]) {
      const map = infected(clean, level);
      const snapshot = JSON.stringify(map);
      const models = resolveMapModels(map);
      for (const group of ["walls", "props"] as const) {
        expect(models[group]).toHaveLength(base[group].length);
        for (const [i, host] of base[group].entries()) {
          const replacement = models[group][i]!;
          expect(replacement.modelId).toMatch(
            new RegExp(`^${host.modelId}-infested-[123]$`),
          );
          expect({ ...replacement, modelId: host.modelId }).toEqual(host);
          expect(takesGhostCutaway(replacement.modelId)).toBe(
            takesGhostCutaway(host.modelId),
          );
        }
      }
      expect(models.infestation.some((p) => p.part?.startsWith("prop:"))).toBe(
        false,
      );
      expect(JSON.stringify(map)).toBe(snapshot);
      expect(resolveMapModels(map)).toEqual(models);
    }
    expect(resolveMapModels(infected(clean, 0))).toEqual(base);
  });

  it("changes a shared wall when only the opposite tile is infested", () => {
    const builder = new FixtureMapBuilder(2, 2, 1).fillGround();
    builder.wall({ x: 0, y: 0, z: 1 }, "n", "window");
    const clean = builder.build();
    const map = {
      ...infected(clean, 4),
      tiles: clean.tiles.map((tile) =>
        tile.z === 0 ? { ...tile, infested: true as const } : tile,
      ),
    };
    const walls = resolveMapModels(clean).walls;
    expect(
      resolveInfestedModels(map, new TileIndex(map), walls)[0]!.modelId,
    ).toContain("-infested-2");
  });

  it("uses any occupied cell of a multi-tile host and leaves unmarked hosts alone", () => {
    const clean = new FixtureMapBuilder(2, 1, 1).fillGround().build();
    const map = {
      ...infected(clean, 4),
      tiles: clean.tiles.map((tile) =>
        tile.x === 1 ? { ...tile, infested: true as const } : tile,
      ),
    };
    const host = {
      modelId: "prop.car-sedan" as const,
      position: { x: 1, y: 0, z: 0.5 },
      tile: { x: 0, y: 0, z: 0 },
      level: 0,
      turns: 1 as const,
      occupiedTiles: clean.tiles,
      part: "prop:car",
    };
    expect(
      resolveInfestedModels(map, new TileIndex(map), [host])[0]!.modelId,
    ).toContain("-infested-2");
    expect(
      resolveInfestedModels(map, new TileIndex(map), [
        { ...host, occupiedTiles: [host.tile] },
      ])[0]!.modelId,
    ).toBe(host.modelId);
  });

  it("matures monotonically and mixes established and consumed hosts at level ten", () => {
    const stages = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const identity = `host-${i}`;
      const sequence = Array.from({ length: 10 }, (_, k) =>
        infestedModelStage(k + 1, identity),
      );
      expect(sequence.slice(0, 3)).toEqual([1, 1, 1]);
      expect(sequence.slice(3, 6)).toEqual([2, 2, 2]);
      expect(sequence).toEqual([...sequence].sort());
      stages.add(sequence[9]!);
    }
    expect([...stages].sort()).toEqual([2, 3]);
  });
});
