import { describe, expect, it } from "vitest";

import { TUNNEL_SABOTAGE } from "../../../content/data/mission-types";
import { BIOME_IDS } from "../../../content/model/biome-id";
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
import { PassMask } from "../../model/pass-mask";
import type { UnitClass } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { generateTacticalMap } from "../../service/generate-tactical-map";
import { validateTacticalMap } from "../../service/map-validator";
import { missionToMapRecipe } from "../../service/mission-map-recipe-adapter";
import { resolveMapGenParams } from "../../service/param-resolver";
import { ReachabilityService } from "../../service/reachability-service";
import { TileIndex } from "../../service/tile-index";
import {
  gapBetween,
  TUNNEL_MOUTH_SPACING,
  TUNNEL_MOUTH_SPREAD_FROM_HOOKS,
  TunnelMouthPlacer,
} from "./tunnel-mouth-placer";

// ===========================================
// Fixtures
// ===========================================

const registries = createDefaultRegistries();

/** A tunnel sabotage offer on the given ground; the spec is not needed for the map. */
function tunnelMission(
  seed: string,
  biome: BiomeId,
  settlement: SettlementScale,
  size: MapSizeId,
  difficulty: number,
): Mission {
  return {
    id: `mission-${seed}`,
    typeId: "tunnel-sabotage",
    cityId: "city-1",
    difficulty,
    mapParams: { biome, settlement, size, seed },
    rewards: { credits: 0, techPoints: 0 },
    createdDay: 1,
    expiresDay: 3,
    ignorePenalty: 0,
  };
}

/** The map a tunnel sabotage offer generates, through the mission adapter. */
function tunnelMap(mission: Mission): TacticalMap {
  const recipe = missionToMapRecipe(mission, TUNNEL_SABOTAGE);
  if (!recipe.ok) {
    throw new Error(`recipe refused: ${recipe.error.kind}`);
  }
  return generateTacticalMap(recipe.value, { registries });
}

/** True when `tiles` are a 2×2 square on one level, in any order. */
function isLevelPair(tiles: readonly TileCoord[]): boolean {
  const xs = tiles.map((tile) => tile.x);
  const zs = tiles.map((tile) => tile.z);
  const keys = new Set(tiles.map((tile) => `${tile.x},${tile.z}`));
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  return (
    tiles.length === 4 &&
    keys.size === 4 &&
    [0, 1].every((dz) =>
      [0, 1].every((dx) => keys.has(`${x0 + dx},${z0 + dz}`)),
    ) &&
    tiles.every((tile) => tile.y === tiles[0]?.y)
  );
}

/** The tunnel mouth hooks of a map. */
function mouthsOf(map: TacticalMap): readonly Hook[] {
  return map.hooks.objectives.filter(
    (hook) => hook.kind === HookKinds.TUNNEL_MOUTH,
  );
}

/** Whether `unitClass` can reach some tile of `hook` from a deploy zone. */
function reaches(map: TacticalMap, hook: Hook, unitClass: UnitClass): boolean {
  const index = new TileIndex(map);
  const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
  const reachable = new ReachabilityService(
    index,
    map.connectors,
  ).reachableFrom(deploy, unitClass);
  return hook.tiles.some((tile) => {
    const at = index.getAt(tile);
    return at !== undefined && reachable.has(index.keyOf(at));
  });
}

// ===========================================
// Property: the shipped mission path, every biome
// ===========================================

describe("TunnelMouthPlacer through the tunnel sabotage map", () => {
  // Every biome, the settlement and size varied across them; two seeds
  // each, one test per biome so no test holds many maps against the
  // timeout.
  const SCALES: readonly SettlementScale[] = ["town", "city", "rural"];
  const SIZES: readonly MapSizeId[] = ["medium", "small", "medium", "large"];

  it.each(BIOME_IDS.map((biome, i) => [biome, i] as const))(
    "%s: three spaced 2×2 mouths both classes reach, away from deploy",
    (biome, i) => {
      const settlement = SCALES[i % SCALES.length] ?? "town";
      const size = SIZES[i % SIZES.length] ?? "medium";
      for (const n of [i, i + BIOME_IDS.length]) {
        const seed = `tunnel-${String(n)}`;
        const map = tunnelMap(
          tunnelMission(seed, biome, settlement, size, 1 + (n % 10)),
        );
        const label = `${seed} ${biome} ${settlement} ${size}`;
        expect(validateTacticalMap(map, registries), label).toEqual([]);
        const mouths = mouthsOf(map);
        expect(mouths, label).toHaveLength(3);
        const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
        for (const mouth of mouths) {
          expect(isLevelPair(mouth.tiles), label).toBe(true);
          expect(mouth.meta?.footprint, label).toBe(2);
          expect(mouth.requiredPass, label).toBe(PassMask.ALL);
          expect(reaches(map, mouth, PassMask.INFANTRY), label).toBe(true);
          expect(reaches(map, mouth, PassMask.MECH), label).toBe(true);
          expect(gapBetween(mouth.tiles, deploy), label).toBeGreaterThanOrEqual(
            10,
          );
        }
        for (const [a, b] of [
          [0, 1],
          [0, 2],
          [1, 2],
        ] as const) {
          expect(
            gapBetween(mouths[a]?.tiles ?? [], mouths[b]?.tiles ?? []),
            `${label}: mouths ${String(a)} and ${String(b)}`,
          ).toBeGreaterThanOrEqual(TUNNEL_MOUTH_SPACING);
        }
      }
    },
  );

  it("is deterministic for a seed", () => {
    const mission = tunnelMission("same", "temperate", "town", "medium", 4);
    expect(mouthsOf(tunnelMap(mission)).map((m) => m.tiles)).toEqual(
      mouthsOf(tunnelMap(mission)).map((m) => m.tiles),
    );
  });
});

// ===========================================
// The placer on a scratch draft
// ===========================================

describe("TunnelMouthPlacer", () => {
  const MOUTHS: HookRequirement = {
    kind: HookKinds.TUNNEL_MOUTH,
    count: 3,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy: 6,
    maxNearestDistanceFromDeploy: 40,
    meta: { footprint: 2 },
  };
  const DEPLOY = { x: 1, y: 0, z: 10 };
  const SPAWNER = { x: 12, y: 0, z: 10 };

  /** A `width` × `depth` grass field with a deploy tile and an egg spawner, after placing `requirement`. */
  function placed(
    requirement: HookRequirement,
    seed: number,
    width = 48,
    depth = 20,
  ): { draft: MapDraft; notes: readonly string[] } {
    const params = resolveMapGenParams(
      {
        archetype: "settlement",
        biome: "temperate",
        settlement: "town",
        size: { width, depth },
        hooks: [],
      },
      registries,
    );
    const draft = new MapDraft(
      width,
      depth,
      new SequentialIdGenerator(),
      SurfaceIds.GRASS,
    );
    draft.addHook("deployZones", HookKinds.DEPLOY, [DEPLOY], PassMask.ALL);
    draft.addHook(
      "objectives",
      HookKinds.EGG_SPAWNER,
      [SPAWNER],
      PassMask.INFANTRY,
    );
    const collector = new DiagnosticsCollector();
    new TunnelMouthPlacer().place(requirement, {
      draft,
      params,
      registries,
      rng: new Mulberry32Rng(seed),
      diagnostics: collector.forPass("hooks"),
    });
    return {
      draft,
      notes: collector.snapshot().notes.map((note) => note.message),
    };
  }

  /** The mouths a placement laid. */
  function mouths(draft: MapDraft): readonly Hook[] {
    return draft.hooks.objectives.filter(
      (hook) => hook.kind === HookKinds.TUNNEL_MOUTH,
    );
  }

  it("spaces the three mouths, over seeds", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const laid = mouths(placed(MOUTHS, seed).draft);
      expect(laid, String(seed)).toHaveLength(3);
      for (let a = 0; a < laid.length; a++) {
        for (let b = a + 1; b < laid.length; b++) {
          expect(
            gapBetween(laid[a]?.tiles ?? [], laid[b]?.tiles ?? []),
            `seed ${String(seed)}: ${String(a)}-${String(b)}`,
          ).toBeGreaterThanOrEqual(TUNNEL_MOUTH_SPACING);
        }
      }
    }
  });

  it("keeps off the deploy distance, the boundary and the hooks placed before it", () => {
    for (let seed = 1; seed <= 6; seed++) {
      for (const mouth of mouths(placed(MOUTHS, seed).draft)) {
        expect(isLevelPair(mouth.tiles)).toBe(true);
        for (const tile of mouth.tiles) {
          expect(manhattanDistance(tile, DEPLOY)).toBeGreaterThanOrEqual(6);
          expect(manhattanDistance(tile, SPAWNER)).toBeGreaterThanOrEqual(
            TUNNEL_MOUTH_SPREAD_FROM_HOOKS,
          );
          expect(tile.x > 0 && tile.z > 0 && tile.x < 47 && tile.z < 19).toBe(
            true,
          );
        }
      }
    }
  });

  it("still lays every mouth on a board too cramped to space them, and says so", () => {
    // The smallest board holds three mouths 12 apart but not five.
    const { draft, notes } = placed({ ...MOUTHS, count: 5 }, 1, 16, 16);
    expect(mouths(draft)).toHaveLength(5);
    expect(notes.join(" ")).toMatch(/5\/5 tunnel mouths, \d under the spacing/);
  });
});
