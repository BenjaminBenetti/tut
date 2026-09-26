import { describe, expect, it } from "vitest";

import { WRECK_RECOVERY } from "../../../content/data/mission-types";
import type { BiomeId } from "../../../content/model/biome-id";
import type { MapSizeId } from "../../../content/model/map-size-id";
import type { SettlementScale } from "../../../content/model/settlement-scale";
import { manhattanDistance } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import type { Mission } from "../../../overworld/model/mission";
import { SurfaceIds } from "../../data/surfaces";
import { HookKinds } from "../../model/hook";
import type { Hook } from "../../model/hook";
import { MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import type { TacticalMap } from "../../model/tactical-map";
import { allows, PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { generateTacticalMap } from "../../service/generate-tactical-map";
import { validateTacticalMap } from "../../service/map-validator";
import { missionToMapRecipe } from "../../service/mission-map-recipe-adapter";
import { resolveMapGenParams } from "../../service/param-resolver";
import { ReachabilityService } from "../../service/reachability-service";
import { TileIndex } from "../../service/tile-index";
import { WRECK_SPREAD_FROM_HOOKS, WreckPlacer } from "./wreck-placer";

// ===========================================
// Fixtures
// ===========================================

const registries = createDefaultRegistries();

/** A wreck recovery offer on the given ground; the payload is not needed for the map. */
function wreckMission(
  seed: string,
  biome: BiomeId,
  settlement: SettlementScale,
  size: MapSizeId,
  difficulty: number,
): Mission {
  return {
    id: `mission-${seed}`,
    typeId: "wreck-recovery",
    cityId: "city-1",
    difficulty,
    mapParams: { biome, settlement, size, seed },
    rewards: { credits: 0, techPoints: 0 },
    createdDay: 1,
    expiresDay: 4,
    ignorePenalty: 0,
  };
}

/** The map a wreck recovery offer generates, through the mission adapter. */
function wreckMap(mission: Mission): TacticalMap {
  const recipe = missionToMapRecipe(mission, WRECK_RECOVERY);
  if (!recipe.ok) {
    throw new Error(`recipe refused: ${recipe.error.kind}`);
  }
  return generateTacticalMap(recipe.value, { registries });
}

/** True when `tiles` are the `side` × `side` square on one level, in any order. */
function isLevelSquare(tiles: readonly TileCoord[], side: number): boolean {
  const xs = tiles.map((tile) => tile.x);
  const zs = tiles.map((tile) => tile.z);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const keys = new Set(tiles.map((tile) => `${tile.x},${tile.z}`));
  const level = tiles[0]?.y;
  if (tiles.length !== side * side || keys.size !== tiles.length) {
    return false;
  }
  for (let dz = 0; dz < side; dz++) {
    for (let dx = 0; dx < side; dx++) {
      if (!keys.has(`${x0 + dx},${z0 + dz}`)) {
        return false;
      }
    }
  }
  return tiles.every((tile) => tile.y === level);
}

/** The wreck hooks of a map. */
function wrecksOf(map: TacticalMap): readonly Hook[] {
  return map.hooks.objectives.filter((hook) => hook.kind === HookKinds.WRECK);
}

// ===========================================
// Property: the shipped mission path
// ===========================================

describe("WreckPlacer through the wreck recovery map", () => {
  const cases: readonly [BiomeId, SettlementScale, MapSizeId][] = [
    ["temperate", "town", "small"],
    ["desert", "rural", "small"],
    ["snowy", "city", "medium"],
    ["coastal", "town", "small"],
    ["temperate", "city", "small"],
    ["desert", "town", "medium"],
  ];

  // Two seeds per case, one test per case, so no single test holds a
  // dozen map generations against the timeout.
  it.each(cases.map((c, i) => [i, ...c] as const))(
    "case %i (%s %s %s): one 3×3 level wreck infantry can reach, away from deploy",
    (i, biome, settlement, size) => {
      for (const n of [i, i + cases.length]) {
        const seed = `wreck-${String(n)}`;
        const map = wreckMap(
          wreckMission(seed, biome, settlement, size, 1 + (n % 10)),
        );
        expect(validateTacticalMap(map, registries), seed).toEqual([]);
        const wrecks = wrecksOf(map);
        expect(wrecks, seed).toHaveLength(1);
        const wreck = wrecks[0];
        if (wreck === undefined) continue;
        expect(wreck.meta?.footprint, seed).toBe(3);
        expect(isLevelSquare(wreck.tiles, 3), seed).toBe(true);
        expect(allows(wreck.requiredPass, PassMask.INFANTRY), seed).toBe(true);

        const index = new TileIndex(map);
        const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
        const reach = new ReachabilityService(index, map.connectors);
        const reachable = reach.reachableFrom(deploy, PassMask.INFANTRY);
        const reached = wreck.tiles.some((tile) => {
          const at = index.getAt(tile);
          return at !== undefined && reachable.has(index.keyOf(at));
        });
        expect(reached, `${seed}: infantry reach the wreck`).toBe(true);

        const nearest = Math.min(
          ...wreck.tiles.flatMap((tile) =>
            deploy.map((d) => manhattanDistance(d, tile)),
          ),
        );
        // The adapter fits 12 to the board; a small map still keeps 6.
        expect(nearest, seed).toBeGreaterThanOrEqual(6);
      }
    },
  );

  it("is deterministic for a seed", () => {
    const mission = wreckMission("same", "temperate", "town", "small", 4);
    expect(wrecksOf(wreckMap(mission))[0]?.tiles).toEqual(
      wrecksOf(wreckMap(mission))[0]?.tiles,
    );
  });
});

// ===========================================
// The placer on a scratch draft
// ===========================================

describe("WreckPlacer", () => {
  const WRECK: HookRequirement = {
    kind: HookKinds.WRECK,
    count: 1,
    requiredPass: PassMask.INFANTRY,
    minDistanceFromDeploy: 6,
    maxNearestDistanceFromDeploy: 12,
    meta: { footprint: 3 },
  };

  /** A 40 × 16 grass field with a deploy tile and an egg spawner, after placing `requirement`. */
  function placed(requirement: HookRequirement, seed: number): MapDraft {
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
    const draft = new MapDraft(
      40,
      16,
      new SequentialIdGenerator(),
      SurfaceIds.GRASS,
    );
    draft.addHook(
      "deployZones",
      HookKinds.DEPLOY,
      [{ x: 1, y: 0, z: 8 }],
      PassMask.ALL,
    );
    draft.addHook(
      "objectives",
      HookKinds.EGG_SPAWNER,
      [{ x: 12, y: 0, z: 8 }],
      PassMask.INFANTRY,
    );
    new WreckPlacer().place(requirement, {
      draft,
      params,
      registries,
      rng: new Mulberry32Rng(seed),
      diagnostics: new DiagnosticsCollector().forPass("hooks"),
    });
    return draft;
  }

  it("keeps to the distance band and clear of the hooks placed before it", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const wreck = placed(WRECK, seed).hooks.objectives.find(
        (hook) => hook.kind === HookKinds.WRECK,
      );
      expect(wreck, String(seed)).toBeDefined();
      if (wreck === undefined) continue;
      expect(isLevelSquare(wreck.tiles, 3), String(seed)).toBe(true);
      const nearest = Math.min(
        ...wreck.tiles.map((tile) =>
          manhattanDistance(tile, { x: 1, y: 0, z: 8 }),
        ),
      );
      expect(nearest).toBeGreaterThanOrEqual(6);
      expect(nearest).toBeLessThanOrEqual(12);
      for (const tile of wreck.tiles) {
        expect(
          manhattanDistance(tile, { x: 12, y: 0, z: 8 }),
        ).toBeGreaterThanOrEqual(WRECK_SPREAD_FROM_HOOKS);
        expect(tile.x > 0 && tile.z > 0 && tile.x < 39 && tile.z < 15).toBe(
          true,
        );
      }
    }
  });

  it("sizes the square from the requirement's footprint", () => {
    const wreck = placed(
      { ...WRECK, meta: { footprint: 2 } },
      1,
    ).hooks.objectives.find((hook) => hook.kind === HookKinds.WRECK);
    expect(wreck?.meta?.footprint).toBe(2);
    expect(isLevelSquare(wreck?.tiles ?? [], 2)).toBe(true);
  });
});
