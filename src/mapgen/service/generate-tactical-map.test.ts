import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import type { MapGenParams, MapRecipe } from "../model/map-recipe";
import { createDefaultRegistries } from "./default-registries";
import {
  generateTacticalMap,
  generateTacticalMapWithDiagnostics,
  MapGenerationError,
} from "./generate-tactical-map";
import { validateTacticalMap } from "./map-validator";

const registries = createDefaultRegistries();

function recipe(
  seed: string,
  overrides: Partial<MapGenParams> = {},
): MapRecipe {
  return {
    seed,
    params: {
      archetype: "settlement",
      biome: "temperate",
      settlement: "town",
      size: "small",
      hooks: DEFAULT_MISSION_HOOKS,
      ...overrides,
    },
  };
}

describe("generateTacticalMap", () => {
  it("returns a valid map that carries its recipe", () => {
    const r = recipe("entry");
    const map = generateTacticalMap(r);
    expect(map.recipe).toBe(r);
    expect(map.width).toBe(32);
    expect(map.depth).toBe(32);
    expect(map.levels).toBeGreaterThanOrEqual(2);
    expect(validateTacticalMap(map, registries)).toEqual([]);
    expect(map.buildings.length).toBeGreaterThan(0);
    expect(map.hooks.objectives).toHaveLength(3);
  });

  it("is deterministic for a recipe and differs across seeds and params", () => {
    expect(generateTacticalMap(recipe("same"))).toEqual(
      generateTacticalMap(recipe("same")),
    );
    expect(generateTacticalMap(recipe("one")).tiles).not.toEqual(
      generateTacticalMap(recipe("two")).tiles,
    );
    expect(generateTacticalMap(recipe("one")).tiles).not.toEqual(
      generateTacticalMap(recipe("one", { biome: "desert" })).tiles,
    );
  });

  it("reports pass diagnostics with timings for every pass", () => {
    const { map, diagnostics } = generateTacticalMapWithDiagnostics(
      recipe("diag"),
    );
    const passes = diagnostics.timings.map((t) => t.pass);
    expect(passes).toEqual([
      "terrain",
      "water",
      "roads",
      "lots",
      "buildings",
      "interiors",
      "props",
      "ramps",
      "hooks",
      "connectivity",
    ]);
    expect(diagnostics.notes.length).toBeGreaterThan(passes.length);
    expect(map.hooks.deployZones.length).toBeGreaterThan(0);
  });

  it("accepts an injected RNG and registries", () => {
    const withRng = generateTacticalMap(recipe("ignored"), {
      rng: new Mulberry32Rng(42),
    });
    const again = generateTacticalMap(recipe("also-ignored"), {
      rng: new Mulberry32Rng(42),
    });
    expect(withRng.tiles).toEqual(again.tiles);
    const custom = generateTacticalMap(recipe("custom"), { registries });
    expect(validateTacticalMap(custom, registries)).toEqual([]);
  });

  it("fails loudly on a recipe it cannot resolve", () => {
    expect(() =>
      generateTacticalMap(
        recipe("bad", { biome: "lunar" as MapGenParams["biome"] }),
      ),
    ).toThrow('Unknown biome id "lunar"');
    expect(() =>
      generateTacticalMap(
        recipe("bad", {
          hooks: [{ kind: "hive-core", count: 1, requiredPass: 1 }],
        }),
      ),
    ).toThrow('Unknown hook placer id "hive-core"');
  });

  it("names the seed and invariants when a map breaks one", () => {
    // A recipe with no hooks has no deploy zone, which I6 rejects.
    expect(() =>
      generateTacticalMap(recipe("hookless", { hooks: [] })),
    ).toThrow(MapGenerationError);
    try {
      generateTacticalMap(recipe("hookless", { hooks: [] }));
    } catch (error) {
      expect(error).toBeInstanceOf(MapGenerationError);
      if (error instanceof MapGenerationError) {
        expect(error.message).toContain('seed "hookless"');
        expect(error.message).toContain("I6");
        expect(error.violations.length).toBeGreaterThan(0);
      }
    }
  });
});
