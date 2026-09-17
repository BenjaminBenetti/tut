import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { resolveMapModels, mapModelIds } from "./map-model-resolver";
import { resinGroundHeight, tileRiseFor } from "./surface-rise";
import { takesGhostCutaway } from "./ghost-cutaway-eligibility";

/** Infested fixture with the same base structures as its clean counterpart. */
function covered(map: TacticalMap, level = 10): TacticalMap {
  return {
    ...map,
    recipe: {
      ...map.recipe,
      params: { ...map.recipe.params, infestationLevel: level },
    },
    tiles: map.tiles.map((tile) => ({ ...tile, infested: true })),
  };
}

describe("Resin Shell map art", () => {
  it("adds no placements at zero and keeps every original placement intact at ten", () => {
    const clean = new FixtureMapBuilder(3, 3, 1).fillGround().build();
    const base = resolveMapModels(clean);
    const infested = resolveMapModels(covered(clean));
    expect(base.infestation).toEqual([]);
    expect(
      infested.infestation.filter((p) =>
        p.modelId.startsWith("infestation.resin.ground-"),
      ),
    ).toHaveLength(clean.tiles.length);
    const { infestation: _skin, ...originals } = infested;
    const { infestation: _none, ...expected } = base;
    expect(originals).toEqual(expected);
    expect(mapModelIds(infested)).toContain("infestation.resin.ground-a");
    const rise = tileRiseFor(covered(clean));
    expect(rise({ x: 1, y: 0, z: 1 })).toBeGreaterThanOrEqual(
      resinGroundHeight(10),
    );
  });

  it("uses open door/window shells, retains demolition identities and ghosts walls only", () => {
    const builder = new FixtureMapBuilder(3, 3, 1).fillGround();
    builder.wall({ x: 0, y: 0, z: 0 }, "n", "door");
    builder.wall({ x: 1, y: 0, z: 0 }, "n", "window");
    const models = resolveMapModels(covered(builder.build()));
    for (const kind of ["door", "window"]) {
      const shell = models.infestation.find(
        (p) => p.modelId === `infestation.resin.${kind}`,
      )!;
      expect(shell).toBeDefined();
      expect(models.walls.find((p) => p.part === shell.part)?.position).toEqual(
        shell.position,
      );
      expect(takesGhostCutaway(shell.modelId)).toBe(true);
    }
    expect(takesGhostCutaway("infestation.resin.ground-a")).toBe(false);
  });

  it("coats a ramp according to its lower surface, even when the upper tile is clean", () => {
    const low = { x: 0, y: 0, z: 0 },
      high = { x: 1, y: 2, z: 0 };
    const builder = new FixtureMapBuilder(2, 1, 3)
      .tile(low, "grass")
      .tile(high, "grass");
    builder.connector("ramp", low, high);
    const map = covered(builder.build());
    const partial = {
      ...map,
      tiles: map.tiles.map((tile) =>
        tile.x === 0 ? tile : { ...tile, infested: undefined },
      ),
    };
    const shell = resolveMapModels(partial).infestation.find(
      (p) => p.resin?.support.ramp,
    );
    expect(shell).toBeDefined();
    expect(shell?.resin?.support.ramp?.from).toEqual(low);
    expect(shell?.tile).toEqual(high);
  });
});
