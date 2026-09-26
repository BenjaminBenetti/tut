import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../../content/model/biome-id";
import type { BiomeId } from "../../../content/model/biome-id";
import { manhattanDistance } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { CIVILIAN_MISSION_HOOKS } from "../../data/hook-requirements";
import { SurfaceIds } from "../../data/surfaces";
import { HookKinds } from "../../model/hook";
import { MapDraft } from "../../model/map-draft";
import type { HookRequirement, MapRecipe } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TacticalMap } from "../../model/tactical-map";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { generateTacticalMap } from "../../service/generate-tactical-map";
import { validateTacticalMap } from "../../service/map-validator";
import { resolveMapGenParams } from "../../service/param-resolver";
import { ReachabilityService } from "../../service/reachability-service";
import { TileIndex } from "../../service/tile-index";
import { CivilianPlacer } from "./civilian-placer";

// ===========================================
// Fixtures
// ===========================================

const registries = createDefaultRegistries();

/** Seeds per biome and size. */
const SEEDS = 3;

/** The sizes an Evacuation offer is generated at. */
const SIZES = ["small", "medium"] as const;

/** Every settlement in turn, by seed, so a village and a city both show. */
const SETTLEMENTS = ["rural", "town", "city"] as const;

/** The civilian requirement of the evacuation hook set. */
const CIVILIANS: HookRequirement = CIVILIAN_MISSION_HOOKS.find(
  (requirement) => requirement.kind === HookKinds.CIVILIAN,
)!;

/**
 * An evacuation recipe: the evacuation hook set on a settlement, the
 * settlement walking rural → town → city by seed and the infestation
 * climbing (0, 3, 6), since the town can already be half the bugs'.
 */
function evacuation(
  biome: BiomeId,
  size: (typeof SIZES)[number],
  seed: number,
): MapRecipe {
  return {
    seed: `civ-${biome}-${size}-${String(seed)}`,
    params: {
      archetype: "settlement",
      biome,
      settlement: SETTLEMENTS[seed % SETTLEMENTS.length]!,
      size,
      infestation: seed * 3,
      hooks: CIVILIAN_MISSION_HOOKS,
    },
  };
}

/** The civilian hooks of a map, in placement order. */
function groupsOf(map: TacticalMap) {
  return map.hooks.objectives.filter(
    (hook) => hook.kind === HookKinds.CIVILIAN,
  );
}

/**
 * A draft with one deploy tile in its corner and the given interior
 * floor tiles, each in the building named beside it, and a placer run
 * over it.
 */
function interiors(
  floors: readonly (readonly [number, number, string])[],
  count: number,
): MapDraft {
  const params = resolveMapGenParams(
    {
      archetype: "settlement",
      biome: "temperate",
      settlement: "town",
      size: { width: 24, depth: 24 },
      hooks: [],
    },
    registries,
  );
  const draft = new MapDraft(
    24,
    24,
    new SequentialIdGenerator(),
    SurfaceIds.GRASS,
  );
  draft.addHook(
    "deployZones",
    HookKinds.DEPLOY,
    [{ x: 1, y: 0, z: 1 }],
    PassMask.ALL,
  );
  for (const [x, z, buildingId] of floors) {
    // The floor stands in for the ground, as a building's does.
    draft.setCovered(x, z);
    draft.addTile({
      x,
      y: 0,
      z,
      surface: SurfaceIds.FLOOR,
      buildingId,
      floorIndex: 0,
    });
  }
  new CivilianPlacer().place(
    { ...CIVILIANS, count, minDistanceFromDeploy: 0 },
    {
      draft,
      params,
      registries,
      rng: new Mulberry32Rng(7),
      diagnostics: new DiagnosticsCollector().forPass("hooks"),
    },
  );
  return draft;
}

// ===========================================
// Tests
// ===========================================

describe("CivilianPlacer on settlements", () => {
  describe.each(SIZES)("at %s", (size) => {
    it.each(BIOME_IDS)(
      "shelters every group inside a building of its own, reachable from deploy with a tile beside it for the rescuer, %s",
      (biome) => {
        for (let seed = 0; seed < SEEDS; seed++) {
          const recipe = evacuation(biome, size, seed);
          const label = recipe.seed;
          const map = generateTacticalMap(recipe, { registries });
          expect(validateTacticalMap(map, registries), label).toEqual([]);

          const groups = groupsOf(map);
          expect(groups, label).toHaveLength(CIVILIANS.count);
          const index = new TileIndex(map);
          const reach = new ReachabilityService(index, map.connectors);
          const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
          const reachable = reach.reachableFrom(deploy, PassMask.INFANTRY);
          const buildings = new Set<string>();
          for (const group of groups) {
            expect(group.tiles, label).toHaveLength(1);
            const at = group.tiles[0]!;
            const tile = index.getAt(at);
            expect(tile, `${label}: a tile`).toBeDefined();
            if (tile === undefined) continue;

            // Inside, on the ground floor, with nothing standing there.
            expect(tile.buildingId, `${label}: indoors`).toBeDefined();
            expect(tile.floorIndex, `${label}: ground floor`).toBe(0);
            expect(tile.propId, `${label}: no prop`).toBeUndefined();
            buildings.add(tile.buildingId ?? "");

            // Reachable from the drop zone, far enough out.
            expect(
              reachable.has(index.keyOf(tile)),
              `${label}: reachable`,
            ).toBe(true);
            expect(
              Math.min(...deploy.map((d) => manhattanDistance(d, at))),
              label,
            ).toBeGreaterThanOrEqual(CIVILIANS.minDistanceFromDeploy ?? 0);

            // A rescuer's tile: a reachable neighbour on the same floor
            // that a squad can step from onto the group's tile.
            const beside = reach
              .neighbours(tile, PassMask.INFANTRY)
              .filter(
                (next) =>
                  next.y === tile.y &&
                  next.propId === undefined &&
                  reachable.has(index.keyOf(next)),
              );
            expect(beside.length, `${label}: a tile beside`).toBeGreaterThan(0);
          }
          // One group to a building. A village with fewer buildings than
          // groups doubles up, but only once every building holds one.
          expect(buildings.size, `${label}: own buildings`).toBe(
            Math.min(groups.length, map.buildings.length),
          );
          if (recipe.params.settlement !== "rural" && size === "medium") {
            expect(buildings.size, `${label}: a town has room`).toBe(
              groups.length,
            );
          }
        }
      },
    );
  });

  it("is deterministic for a seed", () => {
    const make = () =>
      groupsOf(
        generateTacticalMap(evacuation("temperate", "small", 1), {
          registries,
        }),
      ).map((hook) => hook.tiles);
    expect(make()).toEqual(make());
  });
});

describe("CivilianPlacer tiers", () => {
  it("spreads the groups one to a building while there are buildings to spare", () => {
    const floors: (readonly [number, number, string])[] = [];
    // One big building and three one-room huts: picking tiles straight
    // from the pool would crowd the groups into the big one.
    for (let x = 10; x < 20; x++) {
      for (let z = 10; z < 20; z++) floors.push([x, z, "big"]);
    }
    floors.push([4, 12, "hut-a"], [6, 16, "hut-b"], [8, 20, "hut-c"]);
    const draft = interiors(floors, 3);
    const placed = draft.hooks.objectives.map(
      (hook) => draft.getTile(hook.tiles[0]!)?.buildingId,
    );
    expect(placed).toHaveLength(3);
    expect(new Set(placed).size).toBe(3);
  });

  it("doubles up only when the groups outnumber the buildings", () => {
    const draft = interiors(
      [
        [10, 10, "a"],
        [10, 11, "a"],
        [14, 14, "b"],
        [14, 15, "b"],
      ],
      3,
    );
    const placed = draft.hooks.objectives.map(
      (hook) => draft.getTile(hook.tiles[0]!)?.buildingId,
    );
    expect(placed).toHaveLength(3);
    expect(new Set(placed)).toEqual(new Set(["a", "b"]));
  });

  it("falls back to open ground on a board with no interiors, so the count holds", () => {
    const draft = interiors([], 2);
    const hooks = draft.hooks.objectives;
    expect(hooks).toHaveLength(2);
    for (const hook of hooks) {
      expect(hook.kind).toBe(HookKinds.CIVILIAN);
      expect(draft.getTile(hook.tiles[0]!)?.buildingId).toBeUndefined();
    }
  });
});
