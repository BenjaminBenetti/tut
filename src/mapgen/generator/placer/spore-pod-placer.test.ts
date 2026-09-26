import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../../content/model/biome-id";
import type { BiomeId } from "../../../content/model/biome-id";
import { STOREY_LAYERS } from "../../../core/model/elevation";
import { manhattanDistance } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { hashSeed } from "../../../core/service/seed-hash";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import {
  CRASH_SITE_MISSION_HOOKS,
  DEFAULT_MISSION_HOOKS,
} from "../../data/hook-requirements";
import { PropKindIds } from "../../data/props";
import { SurfaceIds } from "../../data/surfaces";
import type { CraterSite } from "../../model/crater-site";
import { allHooks, HookKinds } from "../../model/hook";
import { MapDraft } from "../../model/map-draft";
import type { HookRequirement, MapRecipe } from "../../model/map-recipe";
import { classesIn, PassMask } from "../../model/pass-mask";
import type { TacticalMap } from "../../model/tactical-map";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { freezeDraft } from "../../service/draft-freezer";
import { generateTacticalMap } from "../../service/generate-tactical-map";
import { validateTacticalMap } from "../../service/map-validator";
import { resolveMapGenParams } from "../../service/param-resolver";
import { ReachabilityService } from "../../service/reachability-service";
import { createPipeline } from "../../service/settlement-pipeline";
import { TileIndex } from "../../service/tile-index";
import { CraterPass } from "../crater-pass";
import { POD_SCATTER, SporePodPlacer } from "./spore-pod-placer";

// ===========================================
// Fixtures
// ===========================================

const registries = createDefaultRegistries();

/** Seeds per biome and size: the brief's three. */
const SEEDS = 3;

/** The sizes a Crash Site offer is generated at. */
const SIZES = ["small", "medium"] as const;

/** The tech carcass a priced mission adds through the adapter (#1171). */
const CARCASS: HookRequirement = {
  kind: HookKinds.TECH_CARCASS,
  count: 1,
  requiredPass: PassMask.INFANTRY,
  minDistanceFromDeploy: 8,
  maxNearestDistanceFromDeploy: 30,
};

/**
 * A crash-site recipe with the crash site's hooks. Every other seed also
 * carries a tech carcass, the optional hook a mission may add, and the
 * seeds climb the infestation band (0, 3, 6), since a pod can come down
 * beside a city the bugs already hold.
 */
function crashSite(
  biome: BiomeId,
  size: (typeof SIZES)[number],
  seed: number,
): MapRecipe {
  return {
    seed: `pod-${biome}-${size}-${String(seed)}`,
    params: {
      archetype: "crash-site",
      biome,
      settlement: "rural",
      size,
      infestation: seed * 3,
      hooks:
        seed % 2 === 1
          ? [...CRASH_SITE_MISSION_HOOKS, CARCASS]
          : CRASH_SITE_MISSION_HOOKS,
    },
  };
}

/**
 * Generates the recipe exactly as `generateTacticalMapWithDiagnostics`
 * does — same pipeline, same root RNG, same freezer — keeping the draft
 * so the test can read where the crater pass sank the bowl.
 */
function generate(recipe: MapRecipe): {
  map: TacticalMap;
  crater: CraterSite | undefined;
} {
  const { draft } = createPipeline(recipe.params.archetype, registries).run(
    recipe.params,
    new Mulberry32Rng(hashSeed(recipe.seed)),
  );
  return {
    map: freezeDraft(draft, recipe, registries),
    crater: draft.crater,
  };
}

/** The requirement the adapter builds from `HOOK_KIND_DEFAULTS`. */
const POD: HookRequirement = {
  kind: HookKinds.SPORE_POD,
  count: 1,
  requiredPass: PassMask.ALL,
  minDistanceFromDeploy: 10,
};

/**
 * A flat 48×48 draft with only the crater pass run on it, and a function
 * that runs the pod placer over it.
 */
function bowl(seed: string): {
  draft: MapDraft;
  place: (requirement: HookRequirement) => void;
} {
  const params = resolveMapGenParams(
    {
      archetype: "crash-site",
      biome: "temperate",
      settlement: "rural",
      size: { width: 48, depth: 48 },
      hooks: [],
    },
    registries,
  );
  const draft = new MapDraft(
    48,
    48,
    new SequentialIdGenerator(),
    SurfaceIds.GRASS,
  );
  const diagnostics = new DiagnosticsCollector();
  new CraterPass().run({
    params,
    rng: new Mulberry32Rng(hashSeed(seed)),
    draft,
    registries,
    diagnostics: diagnostics.forPass("crater"),
  });
  return {
    draft,
    place: (requirement) => {
      new SporePodPlacer().place(requirement, {
        params,
        rng: new Mulberry32Rng(hashSeed(`${seed}-pod`)),
        draft,
        registries,
        diagnostics: diagnostics.forPass("hooks"),
      });
    },
  };
}

// ===========================================
// Tests
// ===========================================

describe("SporePodPlacer on the crash-site archetype", () => {
  describe.each(SIZES)("at %s", (size) => {
    it.each(BIOME_IDS)(
      "puts one reachable pod on the crater floor, %s",
      (biome) => {
        for (let seed = 0; seed < SEEDS; seed++) {
          const recipe = crashSite(biome, size, seed);
          const label = recipe.seed;
          const { map, crater } = generate(recipe);
          expect(validateTacticalMap(map, registries), label).toEqual([]);
          expect(crater, label).toBeDefined();
          if (crater === undefined) continue;

          // Exactly one pod, one tile.
          const pods = map.hooks.objectives.filter(
            (hook) => hook.kind === HookKinds.SPORE_POD,
          );
          expect(pods, label).toHaveLength(1);
          const pod = pods[0]!;
          expect(pod.tiles, label).toHaveLength(1);
          const at = pod.tiles[0]!;

          // On the crater floor: inside the floor's radius, and the map's
          // own ground tile there sits at the bowl's deepest level, two
          // storeys under the rim.
          const index = new TileIndex(map);
          const tile = index.getAt(at);
          expect(tile, label).toBeDefined();
          expect(tile?.buildingId, label).toBeUndefined();
          expect(
            Math.hypot(at.x - crater.centre.x, at.z - crater.centre.z),
            label,
          ).toBeLessThanOrEqual(crater.floorRadius);
          expect(tile?.y, label).toBe(crater.rimLevel - 2 * STOREY_LAYERS);

          // Not on the drop zone, and not a prop or slope to stand a pod on.
          const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
          expect(
            deploy.some((d) => d.x === at.x && d.z === at.z),
            label,
          ).toBe(false);
          expect(
            map.props.some((prop) =>
              (prop.occupiedTiles ?? [prop.tile]).some(
                (t) => t.x === at.x && t.z === at.z,
              ),
            ),
            label,
          ).toBe(false);
          expect(tile?.slope, label).toBeUndefined();

          // Every hook reachable from the drop zone by every class it
          // names; the pod names both, mechs included.
          expect(classesIn(pod.requiredPass), label).toEqual(
            classesIn(PassMask.ALL),
          );
          const reach = new ReachabilityService(index, map.connectors);
          for (const hook of allHooks(map.hooks)) {
            for (const unitClass of classesIn(hook.requiredPass)) {
              const reachable = reach.reachableFrom(deploy, unitClass);
              expect(
                reach.anyReachable(reachable, hook.tiles),
                `${label}: ${hook.kind} for class ${String(unitClass)}`,
              ).toBe(true);
            }
          }

          // What a crash site carries and what it does not.
          const kinds = allHooks(map.hooks).map((hook) => hook.kind);
          expect(
            kinds.filter((k) => k === HookKinds.EGG_SPAWNER),
            label,
          ).toHaveLength(0);
          expect(
            kinds.filter((k) => k === HookKinds.EDGE_SPAWN),
            label,
          ).toHaveLength(2);
          expect(
            kinds.filter((k) => k === HookKinds.TECH_CARCASS),
            label,
          ).toHaveLength(seed % 2);
        }
      },
      30_000,
    );
  });

  it("takes the floor column nearest the crater's centre on bare ground", () => {
    // A flat plat with only the bowl sunk into it: no slopes or ramps yet,
    // so nothing on the floor is reachable and the placer's choice is the
    // floor tier's alone — the column at the centre, give or take the
    // scatter.
    for (let seed = 0; seed < 6; seed++) {
      const { draft, place } = bowl(`centre-${String(seed)}`);
      draft.addHook(
        "deployZones",
        HookKinds.DEPLOY,
        [draft.groundCoord(1, 1)],
        PassMask.ALL,
      );
      place({ ...POD, minDistanceFromDeploy: 0 });
      const crater = draft.crater!;
      const at = draft.hooks.objectives[0]!.tiles[0]!;
      expect(draft.hooks.objectives[0]!.kind).toBe(HookKinds.SPORE_POD);
      expect(
        Math.hypot(at.x - crater.centre.x, at.z - crater.centre.z),
      ).toBeLessThanOrEqual(POD_SCATTER);
      expect(at.y).toBe(crater.floorLevel);
    }
  });

  it("keeps off debris, slope pieces and ramp feet at the centre", () => {
    // Every column within BLOCKED of the centre is closed one of three
    // ways, in turn; the pod has to go past all of them. Leave any one
    // exclusion out and the nearest column is one it should have refused.
    const BLOCKED = 2.5;
    for (let seed = 0; seed < 6; seed++) {
      const { draft, place } = bowl(`blocked-${String(seed)}`);
      const crater = draft.crater!;
      draft.addHook(
        "deployZones",
        HookKinds.DEPLOY,
        [draft.groundCoord(1, 1)],
        PassMask.ALL,
      );
      let n = 0;
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (Math.hypot(dx, dz) > BLOCKED) continue;
          const x = crater.centre.x + dx;
          const z = crater.centre.z + dz;
          const blocker = n++ % 3;
          if (blocker === 0) {
            draft.addProp(PropKindIds.BOULDER, draft.groundCoord(x, z));
          } else if (blocker === 1) {
            draft.setSlope(x, z, { kind: "straight", turns: 0 });
          } else {
            draft.addConnector("ramp", draft.groundCoord(x, z), {
              x,
              y: crater.floorLevel + STOREY_LAYERS,
              z: 0,
            });
          }
        }
      }
      place({ ...POD, minDistanceFromDeploy: 0 });
      const at = draft.hooks.objectives[0]!.tiles[0]!;
      expect(
        Math.hypot(at.x - crater.centre.x, at.z - crater.centre.z),
        `seed ${String(seed)}`,
      ).toBeGreaterThan(BLOCKED);
      expect(at.y, `seed ${String(seed)}`).toBe(crater.floorLevel);
    }
  });

  it("stays on the crater floor but keeps its distance from a drop zone beside the centre", () => {
    for (let seed = 0; seed < 6; seed++) {
      const { draft, place } = bowl(`near-${String(seed)}`);
      const crater = draft.crater!;
      const deploy = draft.groundCoord(crater.centre.x + 1, crater.centre.z);
      draft.addHook("deployZones", HookKinds.DEPLOY, [deploy], PassMask.ALL);
      place({ ...POD, minDistanceFromDeploy: 4 });
      const at = draft.hooks.objectives[0]!.tiles[0]!;
      expect(manhattanDistance(at, deploy)).toBeGreaterThanOrEqual(4);
      expect(at.y).toBe(crater.floorLevel);
      expect(
        Math.hypot(at.x - crater.centre.x, at.z - crater.centre.z),
      ).toBeLessThanOrEqual(crater.floorRadius);
    }
  });

  it("is deterministic for a seed", () => {
    const recipe = crashSite("temperate", "small", 0);
    const podOf = (map: TacticalMap) =>
      map.hooks.objectives.find((hook) => hook.kind === HookKinds.SPORE_POD)
        ?.tiles;
    expect(podOf(generate(recipe).map)).toEqual(podOf(generate(recipe).map));
  });

  it("falls back to reachable open ground near the board's centre on a map without a crater", () => {
    const recipe: MapRecipe = {
      seed: "pod-settlement",
      params: {
        archetype: "settlement",
        biome: "temperate",
        settlement: "rural",
        size: "small",
        hooks: [
          ...DEFAULT_MISSION_HOOKS,
          {
            kind: HookKinds.SPORE_POD,
            count: 1,
            requiredPass: PassMask.ALL,
            minDistanceFromDeploy: 10,
          },
        ],
      },
    };
    const map = generateTacticalMap(recipe, { registries });
    const pods = map.hooks.objectives.filter(
      (hook) => hook.kind === HookKinds.SPORE_POD,
    );
    expect(pods).toHaveLength(1);
    expect(validateTacticalMap(map, registries)).toEqual([]);
  });
});
