import { describe, expect, it } from "vitest";

import { manhattanDistance } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { DEFAULT_MISSION_HOOKS } from "../../data/hook-requirements";
import { SurfaceIds } from "../../data/surfaces";
import { MapDraft } from "../../model/map-draft";
import { HookKinds } from "../../model/hook";
import type { HookRequirement, MapRecipe } from "../../model/map-recipe";
import { allows, PassMask } from "../../model/pass-mask";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { generateTacticalMap } from "../../service/generate-tactical-map";
import { validateTacticalMap } from "../../service/map-validator";
import { resolveMapGenParams } from "../../service/param-resolver";
import { ReachabilityService } from "../../service/reachability-service";
import { TileIndex } from "../../service/tile-index";
import {
  MIN_SPREAD_FROM_HOOKS,
  TechCarcassPlacer,
} from "./tech-carcass-placer";

// ===========================================
// Fixtures
// ===========================================

const registries = createDefaultRegistries();

/** The requirement the mission adapter builds for a priced mission. */
const CARCASS: HookRequirement = {
  kind: HookKinds.TECH_CARCASS,
  count: 1,
  requiredPass: PassMask.INFANTRY,
  minDistanceFromDeploy: 8,
  maxNearestDistanceFromDeploy: 30,
};

function recipe(
  seed: string,
  biome: MapRecipe["params"]["biome"],
  settlement: MapRecipe["params"]["settlement"],
): MapRecipe {
  return {
    seed,
    params: {
      archetype: "settlement",
      biome,
      settlement,
      size: "small",
      hooks: [...DEFAULT_MISSION_HOOKS, CARCASS],
    },
  };
}

describe("TechCarcassPlacer", () => {
  it("places exactly one carcass on a walkable tile the squad can reach, away from deploy, across seeds and biomes", () => {
    const cases = [
      ["c-1", "temperate", "town"],
      ["c-2", "desert", "rural"],
      ["c-3", "snowy", "city"],
      ["c-4", "coastal", "town"],
    ] as const;
    for (const [seed, biome, settlement] of cases) {
      const map = generateTacticalMap(recipe(seed, biome, settlement), {
        registries,
      });
      expect(validateTacticalMap(map, registries), seed).toEqual([]);
      const hooks = map.hooks.objectives.filter(
        (hook) => hook.kind === HookKinds.TECH_CARCASS,
      );
      expect(hooks, seed).toHaveLength(1);
      const tile = hooks[0]?.tiles[0];
      expect(tile, seed).toBeDefined();
      if (tile === undefined) continue;
      const index = new TileIndex(map);
      const at = index.getAt(tile);
      expect(at, seed).toBeDefined();
      expect(allows(at?.pass ?? 0, PassMask.INFANTRY), seed).toBe(true);
      const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
      const nearest = Math.min(
        ...deploy.map((d) => manhattanDistance(d, tile)),
      );
      expect(nearest, seed).toBeGreaterThanOrEqual(8);
      expect(nearest, seed).toBeLessThanOrEqual(30);
      const reach = new ReachabilityService(index, map.connectors);
      const reachable = reach.reachableFrom(deploy, PassMask.INFANTRY);
      expect(reachable.has(index.keyOf(at!)), seed).toBe(true);
      // Never on a tile another hook already claims.
      for (const other of map.hooks.objectives) {
        if (other.kind === HookKinds.TECH_CARCASS) continue;
        for (const claimed of other.tiles) {
          expect(
            manhattanDistance(claimed, tile),
            `${seed}: beside ${other.kind}`,
          ).toBeGreaterThanOrEqual(MIN_SPREAD_FROM_HOOKS);
        }
      }
    }
  });

  it("is deterministic for a seed", () => {
    const a = generateTacticalMap(recipe("same", "temperate", "town"), {
      registries,
    });
    const b = generateTacticalMap(recipe("same", "temperate", "town"), {
      registries,
    });
    const carcassOf = (map: typeof a) =>
      map.hooks.objectives.find((h) => h.kind === HookKinds.TECH_CARCASS)
        ?.tiles;
    expect(carcassOf(a)).toEqual(carcassOf(b));
  });

  it("prefers open ground within reach over the far side of the board", () => {
    const deploy = { x: 1, y: 0, z: 8 };
    const params = resolveMapGenParams(
      {
        archetype: "settlement",
        biome: "temperate",
        settlement: "town",
        size: { width: 40, depth: 16 },
        hooks: [],
      },
      registries,
    );
    for (const seed of [1, 2, 3, 4, 5]) {
      const scratch = new MapDraft(
        40,
        16,
        new SequentialIdGenerator(),
        SurfaceIds.GRASS,
      );
      scratch.addHook("deployZones", HookKinds.DEPLOY, [deploy], PassMask.ALL);
      new TechCarcassPlacer().place(
        {
          ...CARCASS,
          minDistanceFromDeploy: 6,
          maxNearestDistanceFromDeploy: 12,
        },
        {
          draft: scratch,
          params,
          registries,
          rng: new Mulberry32Rng(seed),
          diagnostics: new DiagnosticsCollector().forPass("hooks"),
        },
      );
      const hook = scratch.hooks.objectives[0];
      expect(hook?.kind).toBe(HookKinds.TECH_CARCASS);
      const tile = hook?.tiles[0];
      expect(tile).toBeDefined();
      if (tile === undefined) continue;
      const distance = manhattanDistance(deploy, tile);
      expect(distance).toBeGreaterThanOrEqual(6);
      expect(distance).toBeLessThanOrEqual(12);
      expect(scratch.getTile(tile)).toBeUndefined();
    }
  });
});
