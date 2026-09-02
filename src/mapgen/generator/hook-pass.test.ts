import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { manhattanDistance } from "../../core/service/grid-math";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import type { GenerationContext } from "../model/generation-pass";
import { HookKinds } from "../model/hook";
import type { HookPlacer } from "../model/hook-placer";
import type { MapDraft } from "../model/map-draft";
import type {
  HookRequirement,
  MapGenParams,
  MapRecipe,
} from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import type { MapGenRegistries } from "../model/registries";
import type { TacticalMap } from "../model/tactical-map";
import { createDefaultRegistries } from "../service/default-registries";
import { createRegistry } from "../service/definition-registry";
import { freezeDraft } from "../service/draft-freezer";
import type { InvariantId } from "../service/map-validator";
import { validateTacticalMap } from "../service/map-validator";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { BuildingPass } from "./building-pass";
import { HookPass } from "./hook-pass";
import { InteriorPass } from "./interior-pass";
import { LotPass } from "./lot-pass";
import { DEFAULT_HOOK_PLACERS } from "./placer/default-hook-placers";
import { PropPass } from "./prop-pass";
import { RampPass } from "./ramp-pass";
import { RoadPass } from "./road-pass";
import { TerrainPass } from "./terrain-pass";
import { WaterPass } from "./water-pass";

const registries = createDefaultRegistries();

function pipeline(regs: MapGenRegistries = registries): PipelineMapGenerator {
  return new PipelineMapGenerator(
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
    ],
    regs,
  );
}

const generator = pipeline();

function run(
  biome: MapGenParams["biome"],
  settlement: MapGenParams["settlement"],
  seed: string,
  hooks: readonly HookRequirement[] = DEFAULT_MISSION_HOOKS,
  regs: MapGenRegistries = registries,
  gen: PipelineMapGenerator = generator,
): { draft: MapDraft; map: TacticalMap } {
  const params: MapGenParams = {
    archetype: "settlement",
    biome,
    settlement,
    size: "medium",
    hooks,
  };
  const recipe: MapRecipe = { seed, params };
  const { draft } = gen.run(params, new Mulberry32Rng(hashSeed(seed)));
  return { draft, map: freezeDraft(draft, recipe, regs) };
}

function violationsOf(map: TacticalMap, ids: readonly InvariantId[]): string[] {
  return validateTacticalMap(map, registries)
    .filter((v) => ids.includes(v.invariant))
    .map((v) => `${v.invariant}: ${v.message}`);
}

const SEEDS = 5;

describe("HookPass", () => {
  it("satisfies the recipe and places every hook on a legal tile (I6, I8)", () => {
    let maps = 0;
    let unreachable = 0;
    for (const settlement of SETTLEMENT_SCALES) {
      for (const biome of BIOME_IDS) {
        for (let i = 0; i < SEEDS; i++) {
          const label = `${settlement}/${biome}/${i}`;
          const { map } = run(biome, settlement, `hooks-${i}`);
          expect(
            violationsOf(map, ["I1", "I2", "I3", "I4", "I5", "I6", "I8"]),
            label,
          ).toEqual([]);
          maps++;
          if (violationsOf(map, ["I7"]).length > 0) unreachable++;
        }
      }
    }
    // Placers prefer reachable tiles; the connectivity pass (#29) closes the gap.
    expect(unreachable / maps).toBeLessThanOrEqual(0.15);
  });

  it("puts egg spawners indoors often, far from deploy and apart from each other", () => {
    let indoors = 0;
    let total = 0;
    for (const settlement of ["town", "city"] as const) {
      for (let i = 0; i < SEEDS; i++) {
        const { draft } = run("temperate", settlement, `eggs-${i}`);
        const eggs = draft.hooks.objectives.filter(
          (h) => h.kind === HookKinds.EGG_SPAWNER,
        );
        expect(eggs, `${settlement}/${i}`).toHaveLength(3);
        const deploy = draft.hooks.deployZones.flatMap((z) => z.tiles);
        for (const egg of eggs) {
          const tile = egg.tiles[0];
          if (tile === undefined) continue;
          total++;
          if (draft.getTile(tile) !== undefined) indoors++;
          expect(egg.meta?.hatchRadius).toBe(3);
          const nearest = Math.min(
            ...deploy.map((d) => manhattanDistance(d, tile)),
          );
          expect(nearest, `${settlement}/${i}`).toBeGreaterThanOrEqual(12);
        }
        for (let a = 0; a < eggs.length; a++) {
          for (let b = a + 1; b < eggs.length; b++) {
            const ta = eggs[a]?.tiles[0];
            const tb = eggs[b]?.tiles[0];
            if (ta && tb)
              expect(
                manhattanDistance(ta, tb),
                `${settlement}/${i}`,
              ).toBeGreaterThanOrEqual(6);
          }
        }
      }
    }
    expect(indoors / total).toBeGreaterThanOrEqual(0.4);
  });

  it("keeps deploy zones flat and large, and edge spawns on the boundary far away", () => {
    for (const biome of BIOME_IDS) {
      for (let i = 0; i < SEEDS; i++) {
        const { draft } = run(biome, "rural", `zones-${i}`);
        const deploy = draft.hooks.deployZones[0];
        expect(deploy, `${biome}/${i}`).toBeDefined();
        if (deploy === undefined) continue;
        expect(deploy.tiles.length).toBeGreaterThanOrEqual(8);
        expect(new Set(deploy.tiles.map((t) => t.y)).size).toBe(1);
        expect(draft.hooks.edgeSpawns.length).toBe(2);
        for (const zone of draft.hooks.edgeSpawns) {
          expect(zone.tiles.length).toBeGreaterThanOrEqual(1);
          for (const tile of zone.tiles) {
            const onEdge =
              tile.x === 0 ||
              tile.z === 0 ||
              tile.x === draft.width - 1 ||
              tile.z === draft.depth - 1;
            expect(onEdge, `${biome}/${i}`).toBe(true);
            const nearest = Math.min(
              ...deploy.tiles.map((d) => manhattanDistance(d, tile)),
            );
            expect(nearest, `${biome}/${i}`).toBeGreaterThanOrEqual(12);
          }
        }
        expect(draft.hooks.extraction?.tiles).toEqual(deploy.tiles);
      }
    }
  });

  it("accepts a new hook kind through the registry alone", () => {
    const vipPlacer: HookPlacer = {
      id: "vip",
      priority: 15,
      place: (requirement: HookRequirement, ctx: GenerationContext): void => {
        const deploy = ctx.draft.hooks.deployZones[0]?.tiles[0];
        if (deploy === undefined) return;
        ctx.draft.addHook(
          "objectives",
          "vip",
          [deploy],
          requirement.requiredPass,
        );
      },
    };
    const regs: MapGenRegistries = {
      ...registries,
      hookPlacers: createRegistry("hook placer", [
        ...DEFAULT_HOOK_PLACERS,
        vipPlacer,
      ]),
    };
    const hooks: HookRequirement[] = [
      ...DEFAULT_MISSION_HOOKS,
      { kind: "vip", count: 1, requiredPass: PassMask.ALL },
    ];
    const { draft } = run("desert", "town", "vip", hooks, regs, pipeline(regs));
    expect(draft.hooks.objectives.some((h) => h.kind === "vip")).toBe(true);
  });

  it("throws on an unknown hook kind, naming it", () => {
    expect(() =>
      run("desert", "town", "unknown", [
        { kind: "hive-core", count: 1, requiredPass: PassMask.INFANTRY },
      ]),
    ).toThrow('Unknown hook placer id "hive-core"');
  });

  it("is deterministic per seed", () => {
    expect(run("coastal", "city", "det").map.hooks).toEqual(
      run("coastal", "city", "det").map.hooks,
    );
  });
});
