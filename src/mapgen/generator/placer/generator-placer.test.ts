import { describe, expect, it } from "vitest";

import { manhattanDistance } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { INSTALLATION_BUILDING_KIND_IDS } from "../../data/building-kind-ids";
import { SurfaceIds } from "../../data/surfaces";
import { HookKinds } from "../../model/hook";
import { MapDraft } from "../../model/map-draft";
import type { HookRequirement, MapRecipe } from "../../model/map-recipe";
import { allows, PassMask } from "../../model/pass-mask";
import type { TacticalMap } from "../../model/tactical-map";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { generateTacticalMap } from "../../service/generate-tactical-map";
import { validateTacticalMap } from "../../service/map-validator";
import { resolveMapGenParams } from "../../service/param-resolver";
import { ReachabilityService } from "../../service/reachability-service";
import { TileIndex } from "../../service/tile-index";
import {
  gapToRect,
  GeneratorPlacer,
  LANDMARK_RINGS,
  MIN_GENERATOR_SPREAD,
} from "./generator-placer";

// ===========================================
// Fixtures
// ===========================================

const registries = createDefaultRegistries();

/** The hooks the adapter builds for a defence of `generators` generators. */
function defenceHooks(generators: number): HookRequirement[] {
  return [
    { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
    { kind: HookKinds.EDGE_SPAWN, count: 3, requiredPass: PassMask.INFANTRY },
    { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
    {
      kind: HookKinds.GENERATOR,
      count: generators,
      requiredPass: PassMask.INFANTRY,
      minDistanceFromDeploy: 6,
      maxNearestDistanceFromDeploy: 30,
    },
  ];
}

function recipe(
  seed: string,
  biome: MapRecipe["params"]["biome"],
  settlement: MapRecipe["params"]["settlement"],
  landmark: string,
  generators: number,
): MapRecipe {
  return {
    seed,
    params: {
      archetype: "settlement",
      biome,
      settlement,
      size: "medium",
      hooks: defenceHooks(generators),
      landmark,
    },
  };
}

function generatorsOf(map: TacticalMap) {
  return map.hooks.objectives.filter((h) => h.kind === HookKinds.GENERATOR);
}

describe("GeneratorPlacer", () => {
  it("places every generator on reachable open ground around the landmark, across seeds, biomes and installations", () => {
    const cases = [
      ["g-1", "temperate", "town", 0, 3],
      ["g-2", "desert", "rural", 1, 4],
      ["g-3", "snowy", "city", 2, 3],
      ["g-4", "coastal", "town", 3, 2],
      ["g-5", "temperate", "city", 0, 2],
      ["g-6", "desert", "town", 1, 4],
    ] as const;
    for (const [seed, biome, settlement, kindIndex, count] of cases) {
      const landmark = INSTALLATION_BUILDING_KIND_IDS[kindIndex]!;
      const map = generateTacticalMap(
        recipe(seed, biome, settlement, landmark, count),
        { registries },
      );
      expect(validateTacticalMap(map, registries), seed).toEqual([]);
      const building = map.buildings.find((b) => b.kind === landmark);
      expect(building, `${seed}: landmark ${landmark}`).toBeDefined();
      const hooks = generatorsOf(map);
      expect(hooks, seed).toHaveLength(count);
      const index = new TileIndex(map);
      const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
      const reach = new ReachabilityService(index, map.connectors);
      const reachable = reach.reachableFrom(deploy, PassMask.INFANTRY);
      const tiles = hooks.map((hook) => hook.tiles[0]!);
      for (const tile of tiles) {
        const at = index.getAt(tile);
        expect(at, seed).toBeDefined();
        expect(allows(at?.pass ?? 0, PassMask.INFANTRY), seed).toBe(true);
        expect(reachable.has(index.keyOf(at!)), seed).toBe(true);
        expect(at?.buildingId, `${seed}: outdoors`).toBeUndefined();
        const nearest = Math.min(
          ...deploy.map((d) => manhattanDistance(d, tile)),
        );
        expect(nearest, seed).toBeGreaterThanOrEqual(6);
        // In the yard: within the widest ring of the landmark's walls.
        expect(
          gapToRect(building!.footprint[0]!, tile),
          `${seed}: near the ${landmark}`,
        ).toBeLessThanOrEqual(LANDMARK_RINGS[LANDMARK_RINGS.length - 1]!);
      }
      for (let i = 0; i < tiles.length; i++) {
        for (let j = i + 1; j < tiles.length; j++) {
          expect(
            manhattanDistance(tiles[i]!, tiles[j]!),
            `${seed}: spread`,
          ).toBeGreaterThanOrEqual(MIN_GENERATOR_SPREAD);
        }
      }
    }
  });

  it("is deterministic for a seed", () => {
    const make = () =>
      generateTacticalMap(recipe("same", "temperate", "town", "bank", 3), {
        registries,
      });
    expect(generatorsOf(make()).map((h) => h.tiles)).toEqual(
      generatorsOf(make()).map((h) => h.tiles),
    );
  });

  it("gathers around the board's centre when the draft has no landmark", () => {
    const params = resolveMapGenParams(
      {
        archetype: "settlement",
        biome: "temperate",
        settlement: "town",
        size: { width: 40, depth: 40 },
        hooks: [],
      },
      registries,
    );
    for (const seed of [1, 2, 3]) {
      const scratch = new MapDraft(
        40,
        40,
        new SequentialIdGenerator(),
        SurfaceIds.GRASS,
      );
      scratch.addHook(
        "deployZones",
        HookKinds.DEPLOY,
        [{ x: 1, y: 0, z: 1 }],
        PassMask.ALL,
      );
      new GeneratorPlacer().place(defenceHooks(3)[3]!, {
        draft: scratch,
        params,
        registries,
        rng: new Mulberry32Rng(seed),
        diagnostics: new DiagnosticsCollector().forPass("hooks"),
      });
      const hooks = scratch.hooks.objectives;
      expect(hooks, String(seed)).toHaveLength(3);
      for (const hook of hooks) {
        expect(hook.kind).toBe(HookKinds.GENERATOR);
        expect(hook.tiles).toHaveLength(1);
        expect(
          gapToRect({ x: 20, z: 20, w: 1, d: 1 }, hook.tiles[0]!),
          String(seed),
        ).toBeLessThanOrEqual(LANDMARK_RINGS[0]!);
      }
    }
  });

  it("measures the gap to a rectangle in rings", () => {
    const rect = { x: 10, z: 10, w: 4, d: 2 };
    expect(gapToRect(rect, { x: 11, z: 10 })).toBe(0);
    expect(gapToRect(rect, { x: 9, z: 10 })).toBe(1);
    expect(gapToRect(rect, { x: 14, z: 12 })).toBe(1);
    expect(gapToRect(rect, { x: 10, z: 15 })).toBe(4);
    expect(gapToRect(rect, { x: 2, z: 11 })).toBe(8);
  });
});
