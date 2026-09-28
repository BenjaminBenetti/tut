import { describe, expect, it } from "vitest";

import { HIVE_ASSAULT } from "../../../content/data/mission-types";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { hashSeed } from "../../../core/service/seed-hash";
import type { Mission } from "../../../overworld/model/mission";
import { GREAT_HIVE_CAVERN_TUNING } from "../../data/great-hive-cavern-tuning";
import type { HiveCavernTuning } from "../../model/hive-cavern-tuning";
import type { Hook } from "../../model/hook";
import { allHooks, HookKinds } from "../../model/hook";
import type { MapRecipe } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TacticalMap } from "../../model/tactical-map";
import type { TileCoord } from "../../model/tile-coord";
import { createDefaultRegistries } from "../../service/default-registries";
import { freezeDraft } from "../../service/draft-freezer";
import { createHiveCavernPasses } from "../../service/hive-cavern-pipeline";
import { validateTacticalMap } from "../../service/map-validator";
import { missionToMapRecipe } from "../../service/mission-map-recipe-adapter";
import { PipelineMapGenerator } from "../../service/pipeline-map-generator";
import { ReachabilityService } from "../../service/reachability-service";
import { TileIndex } from "../../service/tile-index";

// ===========================================
// Fixtures
// ===========================================

/** Time for two Great Hive cavern generations on a loaded runner. */
const GENERATION_TIMEOUT_MS = 120_000;

/** A Great Hive assault offer on `seed`. */
function greatHive(seed: string): Mission {
  return {
    id: "mission-1",
    typeId: "hive-assault",
    cityId: "city-1",
    difficulty: 8,
    mapParams: { biome: "temperate", settlement: "city", size: "large", seed },
    hive: { hiveId: "greathive-1", regionId: "east", level: 0, great: true },
    rewards: { credits: 1800, techPoints: 170 },
    createdDay: 200,
    expiresDay: 207,
    ignorePenalty: 0,
    pinned: true,
  };
}

/** The Great Hive recipe for `seed`. */
function recipeOf(seed: string): MapRecipe {
  const recipe = missionToMapRecipe(greatHive(seed), HIVE_ASSAULT);
  if (!recipe.ok) throw new Error(JSON.stringify(recipe.error));
  return recipe.value;
}

/** Generates `recipe` on the hive-cavern passes over `tuning`, validated. */
function generate(recipe: MapRecipe, tuning: HiveCavernTuning): TacticalMap {
  const registries = createDefaultRegistries();
  const result = new PipelineMapGenerator(
    createHiveCavernPasses(tuning),
    registries,
  ).run(recipe.params, new Mulberry32Rng(hashSeed(recipe.seed)));
  const map = freezeDraft(result.draft, recipe, registries);
  expect(validateTacticalMap(map, registries)).toEqual([]);
  return map;
}

/** The map's one forward extraction hook; fails with none or several. */
function forwardOf(map: TacticalMap): Hook {
  const hooks = map.hooks.objectives.filter(
    (hook) => hook.kind === HookKinds.FORWARD_EXTRACTION,
  );
  expect(hooks).toHaveLength(1);
  return hooks[0]!;
}

/** A mech's steps from the nearest of `sources`, keyed by tile key. */
function mechSteps(
  map: TacticalMap,
  sources: readonly TileCoord[],
): { index: TileIndex; steps: Map<number, number> } {
  const index = new TileIndex(map);
  const reach = new ReachabilityService(index, map.connectors);
  const steps = new Map<number, number>();
  const queue = sources.flatMap((source) => {
    const tile = index.getAt(source);
    if (tile === undefined || steps.has(index.keyOf(tile))) return [];
    steps.set(index.keyOf(tile), 0);
    return [tile];
  });
  for (const tile of queue) {
    const next = (steps.get(index.keyOf(tile)) ?? 0) + 1;
    for (const neighbour of reach.neighbours(tile, PassMask.MECH)) {
      if (steps.has(index.keyOf(neighbour))) continue;
      steps.set(index.keyOf(neighbour), next);
      queue.push(neighbour);
    }
  }
  return { index, steps };
}

/**
 * A mech's steps to the map's core from the landing zone (`whole`) and
 * from the forward point (`part`), each from its nearest tile.
 */
function walkToCore(
  map: TacticalMap,
  forward: Hook,
): { whole: number; part: number } {
  const core = map.hooks.objectives.find(
    (hook) => hook.kind === HookKinds.HIVE_CORE,
  )!;
  const fromCore = mechSteps(map, core.tiles);
  const nearest = (tiles: readonly TileCoord[]) =>
    Math.min(
      ...tiles.map(
        (tile) => fromCore.steps.get(fromCore.index.keyOf(tile)) ?? Infinity,
      ),
    );
  return {
    whole: nearest(map.hooks.extraction.tiles),
    part: nearest(forward.tiles),
  };
}

/** "x,z" of a column. */
function columnOf(tile: TileCoord): string {
  return `${String(tile.x)},${String(tile.z)}`;
}

/** The kind and tiles of every hook but the forward point, for comparison. */
function otherHooks(map: TacticalMap): string[] {
  return allHooks(map.hooks)
    .filter((hook) => hook.kind !== HookKinds.FORWARD_EXTRACTION)
    .map((hook) => `${hook.kind}:${hook.tiles.map(columnOf).join(" ")}`);
}

// ===========================================
// ForwardExtractionPass
// ===========================================

describe("ForwardExtractionPass (#1179)", () => {
  it(
    "marks one clear, level 4 × 4 zone in a route chamber about coreShare of a mech's walk from the core",
    () => {
      // gh-17's nearest square to the mark lies on a nest's hatching ground.
      for (const seed of ["gh-1", "gh-2", "gh-17"]) {
        const map = generate(recipeOf(seed), GREAT_HIVE_CAVERN_TUNING);
        const forward = forwardOf(map);
        const tuning = GREAT_HIVE_CAVERN_TUNING.forwardExtraction!;

        // A square the landing zone's size, all on one level.
        expect(forward.tiles, seed).toHaveLength(tuning.size * tuning.size);
        const xs = forward.tiles.map((tile) => tile.x);
        const zs = forward.tiles.map((tile) => tile.z);
        expect(Math.max(...xs) - Math.min(...xs), seed).toBe(tuning.size - 1);
        expect(Math.max(...zs) - Math.min(...zs), seed).toBe(tuning.size - 1);
        expect(new Set(forward.tiles.map((tile) => tile.y)).size, seed).toBe(1);

        // In a route chamber, as its brood-chamber hook records it.
        const chamber = map.hooks.objectives.find(
          (hook) =>
            hook.kind === HookKinds.BROOD_CHAMBER &&
            hook.meta?.chamberId === forward.meta?.chamberId,
        );
        expect(chamber?.meta?.role, seed).toBe("route");

        // Out of the heart where the chamber's brood sleeps: these seeds
        // all have room, so none pays the penalty to reach into it.
        const brood = chamber!.tiles[0]!;
        const clearance = Math.max(
          tuning.minHeartClearance,
          tuning.heartClearanceShare * Number(chamber!.meta?.radius),
        );
        for (const tile of forward.tiles) {
          expect(
            Math.hypot(tile.x - brood.x, tile.z - brood.z),
            seed,
          ).toBeGreaterThanOrEqual(clearance);
        }

        // Clear: no prop, no other hook, and off the nests' ground.
        const zone = new Set(forward.tiles.map(columnOf));
        for (const prop of map.props) {
          for (const tile of prop.occupiedTiles ?? [prop.tile]) {
            expect(zone.has(columnOf(tile)), `${seed} prop ${prop.id}`).toBe(
              false,
            );
          }
        }
        for (const hook of allHooks(map.hooks)) {
          if (hook === forward) continue;
          for (const tile of hook.tiles) {
            expect(zone.has(columnOf(tile)), `${seed} ${hook.kind}`).toBe(
              false,
            );
          }
        }
        const nests = map.hooks.objectives
          .filter((hook) => hook.kind === HookKinds.EGG_SPAWNER)
          .flatMap((hook) => hook.tiles);
        for (const tile of forward.tiles) {
          for (const nest of nests) {
            expect(
              Math.max(Math.abs(tile.x - nest.x), Math.abs(tile.z - nest.z)),
              seed,
            ).toBeGreaterThan(tuning.nestClearance);
          }
        }

        // About coreShare (three-eighths): a mech's walk from the zone to
        // the core is within 0.2 of that share of the landing zone's (the
        // chambers it may lie in are few; 0.19–0.53 on 64 seeds).
        const { whole, part } = walkToCore(map, forward);
        expect(whole, seed).toBeLessThan(Infinity);
        expect(
          Math.abs(part / whole - tuning.coreShare),
          `${seed} ${String(part)} of ${String(whole)}`,
        ).toBeLessThan(0.2);
      }
    },
    GENERATION_TIMEOUT_MS,
  );

  it(
    "follows coreShare: a larger share puts the point farther from the core",
    () => {
      const recipe = recipeOf("gh-1");
      const tuning = GREAT_HIVE_CAVERN_TUNING.forwardExtraction!;
      const stepsAt = (coreShare: number): number => {
        const map = generate(recipe, {
          ...GREAT_HIVE_CAVERN_TUNING,
          forwardExtraction: { ...tuning, coreShare },
        });
        return walkToCore(map, forwardOf(map)).part;
      };
      expect(stepsAt(0.7)).toBeGreaterThan(stepsAt(0.2));
    },
    GENERATION_TIMEOUT_MS,
  );

  it(
    "draws nothing: the cavern, its props and its other hooks are the same without it",
    () => {
      const recipe = recipeOf("gh-1");
      const withPoint = generate(recipe, GREAT_HIVE_CAVERN_TUNING);
      const without = generate(recipe, {
        ...GREAT_HIVE_CAVERN_TUNING,
        forwardExtraction: undefined,
      });
      expect(
        without.hooks.objectives.some(
          (hook) => hook.kind === HookKinds.FORWARD_EXTRACTION,
        ),
      ).toBe(false);
      expect(otherHooks(withPoint)).toEqual(otherHooks(without));
      expect(withPoint.tiles.map((tile) => tile.surface)).toEqual(
        without.tiles.map((tile) => tile.surface),
      );
      expect(withPoint.props).toEqual(without.props);
    },
    GENERATION_TIMEOUT_MS,
  );
});
