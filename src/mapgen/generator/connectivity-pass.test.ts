import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import type { GenerationDiagnostics } from "../model/diagnostics";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import { HookKinds } from "../model/hook";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams, MapRecipe } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import type { TacticalMap } from "../model/tactical-map";
import { createDefaultRegistries } from "../service/default-registries";
import { freezeDraft } from "../service/draft-freezer";
import type { InvariantId } from "../service/map-validator";
import { validateTacticalMap } from "../service/map-validator";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { BuildingPass } from "./building-pass";
import { ConnectivityPass } from "./connectivity-pass";
import { HookPass } from "./hook-pass";
import { InteriorPass } from "./interior-pass";
import { LotPass } from "./lot-pass";
import { PropPass } from "./prop-pass";
import { RampPass } from "./ramp-pass";
import { RoadPass } from "./road-pass";
import { TerrainPass } from "./terrain-pass";
import { WaterPass } from "./water-pass";

const registries = createDefaultRegistries();
const ALL: readonly InvariantId[] = [
  "I1",
  "I2",
  "I3",
  "I4",
  "I5",
  "I6",
  "I7",
  "I8",
];

const generator = new PipelineMapGenerator(
  [
    new TerrainPass(),
    new WaterPass(),
    new RoadPass(),
    new LotPass(),
    new BuildingPass(),
    new InteriorPass(),
    new PropPass(),
    new RampPass(),
    new HookPass(),
    new ConnectivityPass(),
  ],
  registries,
);

function params(
  biome: MapGenParams["biome"],
  settlement: MapGenParams["settlement"],
  size: MapGenParams["size"] = "medium",
): MapGenParams {
  return {
    archetype: "settlement",
    biome,
    settlement,
    size,
    hooks: DEFAULT_MISSION_HOOKS,
  };
}

function violations(
  map: TacticalMap,
  ids: readonly InvariantId[] = ALL,
): string[] {
  return validateTacticalMap(map, registries)
    .filter((v) => ids.includes(v.invariant))
    .map((v) => `${v.invariant}: ${v.message}`);
}

/**
 * Fixture: 20×20 flat grass with a 4×4 deploy zone in the north-west
 * corner, then whatever `build` adds, then the connectivity pass.
 */
function scenario(build: (draft: MapDraft) => void): {
  map: TacticalMap;
  notes: string[];
} {
  const provides: DraftCapability[] = [
    "heightmap",
    "water",
    "roads",
    "lots",
    "buildings",
    "interiors",
    "props",
    "ramps",
    "hooks",
  ];
  const fixture: GenerationPass = {
    id: "fixture",
    requires: [],
    provides,
    run: (ctx: GenerationContext): void => {
      const tiles = [];
      for (let z = 1; z <= 4; z++)
        for (let x = 1; x <= 4; x++) tiles.push({ x, y: 0, z });
      ctx.draft.addHook("deployZones", HookKinds.DEPLOY, tiles, PassMask.ALL);
      build(ctx.draft);
    },
  };
  const p: MapGenParams = {
    archetype: "settlement",
    biome: "temperate",
    settlement: "rural",
    size: { width: 20, depth: 20 },
    hooks: [],
  };
  const result = new PipelineMapGenerator(
    [fixture, new ConnectivityPass()],
    registries,
  ).run(p, new Mulberry32Rng(hashSeed("scenario")));
  const recipe: MapRecipe = { seed: "scenario", params: p };
  return {
    map: freezeDraft(result.draft, recipe, registries),
    notes: notesOf(result.diagnostics),
  };
}

function notesOf(diagnostics: GenerationDiagnostics): string[] {
  return diagnostics.notes
    .filter((n) => n.pass === "connectivity")
    .map((n) => n.message);
}

const SEEDS = 6;

describe("ConnectivityPass", () => {
  it("makes every generated map satisfy all eight invariants", () => {
    let hooks = 0;
    let relocations = 0;
    for (const settlement of SETTLEMENT_SCALES) {
      for (const biome of BIOME_IDS) {
        for (let i = 0; i < SEEDS; i++) {
          const label = `${settlement}/${biome}/${i}`;
          const p = params(biome, settlement);
          const result = generator.run(
            p,
            new Mulberry32Rng(hashSeed(`connect-${i}`)),
          );
          const map = freezeDraft(
            result.draft,
            { seed: `connect-${i}`, params: p },
            registries,
          );
          expect(violations(map), label).toEqual([]);
          hooks += map.hooks.objectives.length + map.hooks.edgeSpawns.length;
          relocations += notesOf(result.diagnostics).filter((n) =>
            n.includes("relocated"),
          ).length;
        }
      }
    }
    expect(relocations / hooks).toBeLessThanOrEqual(0.05);
  }, 30_000);

  it("removes a blocking prop rather than relocating", () => {
    const { map, notes } = scenario((draft) => {
      for (let z = 0; z < 20; z++)
        draft.addProp(PropKindIds.BOULDER, draft.groundCoord(10, z));
      draft.addHook(
        "objectives",
        HookKinds.EGG_SPAWNER,
        [{ x: 15, y: 0, z: 10 }],
        PassMask.ALL,
      );
    });
    expect(violations(map, ["I7"])).toEqual([]);
    expect(notes.some((n) => n.includes("removed prop"))).toBe(true);
    expect(notes.some((n) => n.includes("relocated"))).toBe(false);
    expect(map.props).toHaveLength(19);
  });

  it("opens a door in a sealed building for infantry", () => {
    const { map, notes } = scenario((draft) => {
      for (let z = 8; z <= 10; z++) {
        for (let x = 12; x <= 14; x++) {
          draft.addTile({
            x,
            y: 0,
            z,
            surface: SurfaceIds.FLOOR,
            buildingId: "sealed",
            floorIndex: 0,
          });
          draft.setCovered(x, z);
          if (z === 8) draft.setWall({ x, y: 0, z }, "n", "solid");
          if (z === 10) draft.setWall({ x, y: 0, z }, "s", "solid");
          if (x === 12) draft.setWall({ x, y: 0, z }, "w", "solid");
          if (x === 14) draft.setWall({ x, y: 0, z }, "e", "solid");
        }
      }
      draft.addHook(
        "objectives",
        HookKinds.EGG_SPAWNER,
        [{ x: 13, y: 0, z: 9 }],
        PassMask.INFANTRY,
      );
    });
    expect(violations(map, ["I7"])).toEqual([]);
    expect(notes.some((n) => n.includes("opened a door"))).toBe(true);
    expect(notes.some((n) => n.includes("relocated"))).toBe(false);
  });

  it("bridges a cliff with a ramp for both classes", () => {
    const { map, notes } = scenario((draft) => {
      for (let z = 0; z < 20; z++)
        for (let x = 10; x < 20; x++) draft.setGroundLevel(x, z, 1);
      draft.addHook(
        "objectives",
        HookKinds.EGG_SPAWNER,
        [{ x: 15, y: 1, z: 10 }],
        PassMask.ALL,
      );
    });
    expect(violations(map, ["I7"])).toEqual([]);
    expect(
      notes.filter((n) => n.includes("added ramp")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      map.connectors.filter((c) => c.kind === "ramp").length,
    ).toBeGreaterThanOrEqual(1);
    expect(notes.some((n) => n.includes("relocated"))).toBe(false);
  });

  it("relocates a hook nothing can reach", () => {
    const { map, notes } = scenario((draft) => {
      for (let z = 8; z <= 12; z++) {
        for (let x = 13; x <= 17; x++) {
          if (x === 15 && z === 10) continue;
          draft.setGroundSurface(x, z, SurfaceIds.WATER);
        }
      }
      draft.addHook(
        "objectives",
        HookKinds.EGG_SPAWNER,
        [{ x: 15, y: 0, z: 10 }],
        PassMask.INFANTRY,
      );
    });
    expect(violations(map, ["I7"])).toEqual([]);
    expect(notes.some((n) => n.includes("relocated"))).toBe(true);
    const egg = map.hooks.objectives[0]?.tiles[0];
    expect(egg).toBeDefined();
    expect(egg?.x === 15 && egg?.z === 10).toBe(false);
  });

  it("is deterministic per seed", () => {
    const p = params("coastal", "city");
    const a = generator.run(p, new Mulberry32Rng(hashSeed("det"))).draft;
    const b = generator.run(p, new Mulberry32Rng(hashSeed("det"))).draft;
    expect(freezeDraft(a, { seed: "det", params: p }, registries)).toEqual(
      freezeDraft(b, { seed: "det", params: p }, registries),
    );
  });
});
