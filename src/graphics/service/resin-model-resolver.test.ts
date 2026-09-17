import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { resolveMapModels, mapModelIds } from "./map-model-resolver";
import { resinGroundHeight, tileRiseFor } from "./surface-rise";
import { takesGhostCutaway } from "./ghost-cutaway-eligibility";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { tileTop } from "../view/tactical-map-view";

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
  it("keeps the continuous skin above actual thin slabs and raised sidewalks", () => {
    for (const surface of [
      "grass",
      "snow",
      "sand",
      "road",
      "sidewalk",
      "floor",
      "roof",
    ]) {
      const map = covered(
        new FixtureMapBuilder(1, 1, 1).fillGround(0, surface).build(),
      );
      const models = resolveMapModels(map);
      const support = models.tiles[0]!;
      const shell = models.infestation.find((p) =>
        p.modelId.startsWith("infestation.resin.ground-"),
      )!;
      const top = support.position.y + MODEL_MANIFEST[support.modelId].height;
      expect(shell.position.y, surface).toBeGreaterThan(top);
      expect(tileRiseFor(map)(support.tile)).toBeCloseTo(
        shell.position.y - tileTop(support.tile.y) + resinGroundHeight(10),
      );
    }
  });

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
  it("uses a shared network phase and connects only marked neighbouring cells", () => {
    const map = covered(new FixtureMapBuilder(3, 1, 1).fillGround().build());
    const full = resolveMapModels(map).infestation.filter((p) => p.resin);
    const a = full[0]!.resin!.pattern!,
      b = full[1]!.resin!.pattern!;
    expect((a.x + 1) % 6).toBe(b.x);
    expect(a.z).toBe(b.z);
    expect(a.turns).toBe(b.turns);
    expect(a.neighbours & 4).toBe(4);
    expect(b.neighbours & 64).toBe(64);
    const separated = {
      ...map,
      tiles: map.tiles.map((t) =>
        t.x === 1 ? { ...t, infested: undefined } : t,
      ),
    };
    const edges = resolveMapModels(separated).infestation.filter(
      (p) => p.resin,
    );
    expect(edges).toHaveLength(2);
    expect(edges.every((p) => p.resin!.pattern!.neighbours === 0)).toBe(true);
    const early = resolveMapModels(covered(map, 2)).infestation.find(
      (p) => p.resin,
    )!.resin!.pattern!;
    expect([early.x, early.z, early.turns]).toEqual([a.x, a.z, a.turns]);
    expect(early.growth).toBeLessThan(a.growth);
  });
});
