import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { DIRECTIONS } from "../../core/model/direction";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import {
  oppositeDirection,
  rectContains,
  stepGridPos,
} from "../../core/service/grid-math";
import { BUILDING_TEMPLATES } from "../data/building-templates";
import { KNOWN_BUILDING_KIND_IDS } from "../data/building-kind-ids";
import { SETTLEMENT_DEFINITIONS } from "../data/settlements";
import { SurfaceIds } from "../data/surfaces";
import type { BiomeDefinition } from "../model/biome-definition";
import type { Building } from "../model/building";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams } from "../model/map-recipe";
import type { MapGenRegistries } from "../model/registries";
import { createDefaultRegistries } from "../service/default-registries";
import { createRegistry } from "../service/definition-registry";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { BuildingPass } from "./building-pass";
import { LotPass } from "./lot-pass";
import { RoadPass } from "./road-pass";
import { TerrainPass } from "./terrain-pass";
import { WaterPass } from "./water-pass";

const registries = createDefaultRegistries();
const generator = new PipelineMapGenerator(
  [
    new TerrainPass(),
    new WaterPass(),
    new RoadPass(),
    new LotPass(),
    new BuildingPass(),
  ],
  registries,
);

function run(
  biome: MapGenParams["biome"],
  settlement: MapGenParams["settlement"],
  seed: string,
): MapDraft {
  return generator.run(
    { archetype: "settlement", biome, settlement, size: "medium", hooks: [] },
    new Mulberry32Rng(hashSeed(seed)),
  ).draft;
}

/** A pass that plants one lot so the building pass can be tested alone. */
function oneLotPass(frontage: "n" | "e" | "s" | "w"): GenerationPass {
  const provides: DraftCapability[] = ["heightmap", "water", "roads", "lots"];
  return {
    id: "one-lot",
    requires: [],
    provides,
    run: (ctx: GenerationContext): void => {
      const { draft } = ctx;
      // A road ring around the lot so every frontage has a corridor.
      for (let i = 4; i <= 15; i++) {
        for (const [x, z] of [
          [i, 4],
          [i, 15],
          [4, i],
          [15, i],
        ] as const) {
          draft.setRoad(x, z);
          draft.setGroundLevel(x, z, 1);
        }
      }
      for (let z = 5; z < 15; z++) {
        for (let x = 5; x < 15; x++) draft.setGroundLevel(x, z, 1);
      }
      draft.lots.push({
        id: "lot-1",
        rect: { x: 6, z: 6, w: 8, d: 8 },
        level: 1,
        frontage,
      });
      for (let z = 6; z < 14; z++) {
        for (let x = 6; x < 14; x++) draft.setGroundLevel(x, z, 1);
      }
    },
  };
}

function singleKindRegistries(kind: string): MapGenRegistries {
  const biome: BiomeDefinition = {
    ...registries.biomes.get("temperate"),
    buildingKinds: [{ template: kind, weight: 1 }],
  };
  return { ...registries, biomes: createRegistry("biome", [biome]) };
}

function checkShell(draft: MapDraft, building: Building, label: string): void {
  const footprint = building.footprint[0];
  expect(footprint, label).toBeDefined();
  if (footprint === undefined) return;
  const template =
    BUILDING_TEMPLATES[building.kind as keyof typeof BUILDING_TEMPLATES];
  expect(building.floors.length, label).toBeGreaterThanOrEqual(
    template.floors.min,
  );
  expect(building.floors.length, label).toBeLessThanOrEqual(
    template.floors.max,
  );
  building.floors.forEach((floor, i) => {
    expect(floor.index, label).toBe(i);
    expect(floor.y, label).toBe(building.groundLevel + i);
    for (let z = footprint.z; z < footprint.z + footprint.d; z++) {
      for (let x = footprint.x; x < footprint.x + footprint.w; x++) {
        const tile = draft.getTile({ x, y: floor.y, z });
        expect(tile?.buildingId, `${label} tile ${x},${floor.y},${z}`).toBe(
          building.id,
        );
        expect(tile?.floorIndex, label).toBe(i);
        expect(tile?.surface, label).toBe(SurfaceIds.FLOOR);
        expect(draft.isCovered(x, z), label).toBe(true);
        for (const side of DIRECTIONS) {
          const beyond = stepGridPos({ x, y: floor.y, z }, side);
          const outward = !rectContains(footprint, beyond.x, beyond.z);
          const wall = draft.wallAt({ x, y: floor.y, z }, side);
          if (outward) {
            expect(
              wall,
              `${label} missing wall ${side} at ${x},${floor.y},${z}`,
            ).toBeDefined();
            if (draft.inBounds(beyond.x, beyond.z)) {
              expect(draft.wallAt(beyond, oppositeDirection(side)), label).toBe(
                wall,
              );
            }
          } else {
            expect(
              wall,
              `${label} interior wall ${side} at ${x},${floor.y},${z}`,
            ).toBeUndefined();
          }
        }
      }
    }
  });
  expect(building.entrances.length, label).toBeGreaterThanOrEqual(1);
  for (const entrance of building.entrances) {
    expect(entrance.tile.y, label).toBe(building.groundLevel);
    expect(
      rectContains(footprint, entrance.tile.x, entrance.tile.z),
      label,
    ).toBe(true);
    expect(draft.wallAt(entrance.tile, entrance.side), label).toBe("door");
    const outside = stepGridPos(entrance.tile, entrance.side);
    expect(rectContains(footprint, outside.x, outside.z), label).toBe(false);
    expect(draft.groundSurfaceAt(outside.x, outside.z), label).not.toBe(
      SurfaceIds.WATER,
    );
    expect(draft.groundLevelAt(outside.x, outside.z), label).toBe(
      building.groundLevel,
    );
  }
  expect(building.roof.walkable && building.roof.kind !== "flat", label).toBe(
    false,
  );
}

const SEEDS = 8;

describe("BuildingPass", () => {
  it("raises a valid shell for every template on its own lot", () => {
    for (const kind of KNOWN_BUILDING_KIND_IDS) {
      for (const frontage of DIRECTIONS) {
        const single = new PipelineMapGenerator(
          [oneLotPass(frontage), new BuildingPass()],
          singleKindRegistries(kind),
        );
        const { draft } = single.run(
          {
            archetype: "settlement",
            biome: "temperate",
            settlement: "city",
            size: { width: 20, depth: 20 },
            hooks: [],
          },
          new Mulberry32Rng(hashSeed(`${kind}-${frontage}`)),
        );
        expect(draft.buildings, `${kind}/${frontage}`).toHaveLength(1);
        const building = draft.buildings[0];
        if (building === undefined) continue;
        expect(building.kind).toBe(kind);
        expect(building.entrances[0]?.side).toBe(frontage);
        checkShell(draft, building, `${kind}/${frontage}`);
      }
    }
  });

  it("puts at most one building per lot, within the settlement's ranges", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      for (const biome of BIOME_IDS) {
        for (let i = 0; i < SEEDS; i++) {
          const label = `${settlement}/${biome}/${i}`;
          const draft = run(biome, settlement, `shell-${i}`);
          const definition = SETTLEMENT_DEFINITIONS[settlement];
          expect(draft.buildings.length, label).toBeGreaterThan(0);
          expect(draft.buildings.length, label).toBeLessThanOrEqual(
            draft.lots.length,
          );
          expect(draft.buildings.length, label).toBeLessThanOrEqual(
            definition.buildingCount.max,
          );
          for (const building of draft.buildings) {
            const footprint = building.footprint[0];
            if (footprint === undefined) continue;
            const owners = draft.lots.filter((lot) =>
              rectContains(lot.rect, footprint.x, footprint.z),
            );
            expect(owners, label).toHaveLength(1);
            const lot = owners[0];
            if (lot === undefined) continue;
            expect(building.groundLevel, label).toBe(lot.level);
            expect(footprint.x + footprint.w, label).toBeLessThanOrEqual(
              lot.rect.x + lot.rect.w,
            );
            expect(footprint.z + footprint.d, label).toBeLessThanOrEqual(
              lot.rect.z + lot.rect.d,
            );
            expect(building.entrances[0]?.side, label).toBe(lot.frontage);
            const template =
              BUILDING_TEMPLATES[
                building.kind as keyof typeof BUILDING_TEMPLATES
              ];
            expect(template.scales, label).toContain(settlement);
            checkShell(draft, building, label);
          }
          const perLot = new Map<string, number>();
          for (const building of draft.buildings) {
            const footprint = building.footprint[0];
            if (footprint === undefined) continue;
            for (const lot of draft.lots) {
              if (rectContains(lot.rect, footprint.x, footprint.z)) {
                perLot.set(lot.id, (perLot.get(lot.id) ?? 0) + 1);
              }
            }
          }
          for (const count of perLot.values()) expect(count, label).toBe(1);
        }
      }
    }
  });

  it("produces some multi-storey buildings in towns and cities", () => {
    let tall = 0;
    for (let i = 0; i < SEEDS; i++) {
      tall += run("temperate", "city", `tall-${i}`).buildings.filter(
        (b) => b.floors.length >= 2,
      ).length;
    }
    expect(tall).toBeGreaterThan(0);
  });

  it("mixes windows and solid walls", () => {
    const draft = run("desert", "town", "windows");
    const kinds = new Set<string>();
    for (const building of draft.buildings) {
      const footprint = building.footprint[0];
      if (footprint === undefined) continue;
      for (let x = footprint.x; x < footprint.x + footprint.w; x++) {
        const kind = draft.wallAt(
          { x, y: building.groundLevel, z: footprint.z },
          "n",
        );
        if (kind !== undefined) kinds.add(kind);
      }
    }
    expect(kinds.has("solid")).toBe(true);
    expect(kinds.has("window")).toBe(true);
  });

  it("is deterministic per seed", () => {
    expect(run("snowy", "town", "det").buildings).toEqual(
      run("snowy", "town", "det").buildings,
    );
  });
});
