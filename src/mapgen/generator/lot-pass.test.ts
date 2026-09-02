import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { rectContains, rectsOverlap } from "../../core/service/grid-math";
import { SETTLEMENT_DEFINITIONS } from "../data/settlements";
import { SurfaceIds } from "../data/surfaces";
import type { Lot } from "../model/lot";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams } from "../model/map-recipe";
import { createDefaultRegistries } from "../service/default-registries";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { areaFactor, LotPass } from "./lot-pass";
import { RoadPass } from "./road-pass";
import { TerrainPass } from "./terrain-pass";
import { WaterPass } from "./water-pass";

const registries = createDefaultRegistries();
const generator = new PipelineMapGenerator(
  [new TerrainPass(), new WaterPass(), new RoadPass(), new LotPass()],
  registries,
);

function run(
  biome: MapGenParams["biome"],
  settlement: MapGenParams["settlement"],
  seed: string,
  size: MapGenParams["size"] = "medium",
): MapDraft {
  return generator.run(
    { archetype: "settlement", biome, settlement, size, hooks: [] },
    new Mulberry32Rng(hashSeed(seed)),
  ).draft;
}

/** The columns just outside the lot on its frontage side. */
function frontColumns(lot: Lot): { x: number; z: number }[] {
  const { rect, frontage } = lot;
  const out: { x: number; z: number }[] = [];
  switch (frontage) {
    case "n":
      for (let x = rect.x; x < rect.x + rect.w; x++)
        out.push({ x, z: rect.z - 1 });
      break;
    case "s":
      for (let x = rect.x; x < rect.x + rect.w; x++)
        out.push({ x, z: rect.z + rect.d });
      break;
    case "w":
      for (let z = rect.z; z < rect.z + rect.d; z++)
        out.push({ x: rect.x - 1, z });
      break;
    case "e":
      for (let z = rect.z; z < rect.z + rect.d; z++)
        out.push({ x: rect.x + rect.w, z });
      break;
  }
  return out;
}

function isCorridor(draft: MapDraft, x: number, z: number): boolean {
  return (
    draft.inBounds(x, z) &&
    (draft.isRoad(x, z) || draft.groundSurfaceAt(x, z) === SurfaceIds.SIDEWALK)
  );
}

function expand(lot: Lot): { x: number; z: number; w: number; d: number } {
  return {
    x: lot.rect.x - 1,
    z: lot.rect.z - 1,
    w: lot.rect.w + 2,
    d: lot.rect.d + 2,
  };
}

const SEEDS = 10;

describe("LotPass", () => {
  it("places lots on free land beside the road corridor with gaps and margins", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      for (const biome of BIOME_IDS) {
        for (let i = 0; i < SEEDS; i++) {
          const label = `${settlement}/${biome}/${i}`;
          const draft = run(biome, settlement, `lots-${i}`);
          const definition = SETTLEMENT_DEFINITIONS[settlement];
          expect(draft.lots.length, label).toBeGreaterThan(0);
          for (const lot of draft.lots) {
            const { rect } = lot;
            expect(rect.w, label).toBeGreaterThanOrEqual(
              definition.lotWidth.min,
            );
            expect(rect.d, label).toBeGreaterThanOrEqual(
              definition.lotDepth.min,
            );
            expect(rect.x, label).toBeGreaterThanOrEqual(1);
            expect(rect.z, label).toBeGreaterThanOrEqual(1);
            expect(rect.x + rect.w, label).toBeLessThanOrEqual(draft.width - 1);
            expect(rect.z + rect.d, label).toBeLessThanOrEqual(draft.depth - 1);
            for (let z = rect.z; z < rect.z + rect.d; z++) {
              for (let x = rect.x; x < rect.x + rect.w; x++) {
                expect(draft.isRoad(x, z), label).toBe(false);
                expect(draft.groundSurfaceAt(x, z), label).not.toBe(
                  SurfaceIds.WATER,
                );
                expect(draft.groundSurfaceAt(x, z), label).not.toBe(
                  SurfaceIds.SIDEWALK,
                );
                expect(draft.groundLevelAt(x, z), label).toBe(lot.level);
              }
            }
            const front = frontColumns(lot);
            expect(
              front.some(({ x, z }) => isCorridor(draft, x, z)),
              `${label} lot ${lot.id} fronts no corridor`,
            ).toBe(true);
            const anchor = front[0];
            if (anchor !== undefined && isCorridor(draft, anchor.x, anchor.z)) {
              expect(draft.groundLevelAt(anchor.x, anchor.z), label).toBe(
                lot.level,
              );
            }
          }
          for (let a = 0; a < draft.lots.length; a++) {
            for (let b = a + 1; b < draft.lots.length; b++) {
              const first = draft.lots[a];
              const second = draft.lots[b];
              if (first === undefined || second === undefined) continue;
              expect(rectsOverlap(expand(first), second.rect), label).toBe(
                false,
              );
            }
          }
        }
      }
    }
  });

  it("hits the settlement's building count range on medium maps", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      const range = SETTLEMENT_DEFINITIONS[settlement].buildingCount;
      for (let i = 0; i < SEEDS; i++) {
        const draft = run("temperate", settlement, `count-${i}`);
        expect(draft.lots.length, `${settlement}/${i}`).toBeGreaterThanOrEqual(
          range.min,
        );
        expect(draft.lots.length, `${settlement}/${i}`).toBeLessThanOrEqual(
          range.max,
        );
      }
    }
  });

  it("scales the target by map area: fewer lots on small maps, more on large", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      const range = SETTLEMENT_DEFINITIONS[settlement].buildingCount;
      for (let i = 0; i < SEEDS; i++) {
        const small = run("coastal", settlement, `small-${i}`, "small");
        expect(small.lots.length, `${settlement}/${i}`).toBeGreaterThan(0);
        expect(small.lots.length, `${settlement}/${i}`).toBeLessThanOrEqual(
          Math.round(range.max * areaFactor(32, 32)),
        );
        const large = run("temperate", settlement, `large-${i}`, "large");
        expect(large.lots.length, `${settlement}/${i}`).toBeLessThanOrEqual(
          Math.round(range.max * areaFactor(64, 64)),
        );
        if (settlement !== "rural") {
          expect(large.lots.length, `${settlement}/${i}`).toBeGreaterThan(
            range.min,
          );
        }
      }
    }
    expect(areaFactor(48, 48)).toBe(1);
    expect(areaFactor(32, 32)).toBe(0.5);
    expect(areaFactor(64, 64)).toBeCloseTo(1.778, 2);
    expect(areaFactor(256, 256)).toBe(2);
    expect(areaFactor(16, 16)).toBe(0.5);
  });

  it("uses more than one frontage direction across a town", () => {
    const frontages = new Set<string>();
    for (let i = 0; i < 5; i++) {
      for (const lot of run("desert", "town", `front-${i}`).lots) {
        frontages.add(lot.frontage);
      }
    }
    expect(frontages.size).toBeGreaterThan(1);
  });

  it("never places a lot on a column another lot claims", () => {
    const draft = run("snowy", "city", "claims");
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        const owners = draft.lots.filter((lot) => rectContains(lot.rect, x, z));
        expect(owners.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic per seed", () => {
    expect(run("temperate", "city", "det").lots).toEqual(
      run("temperate", "city", "det").lots,
    );
  });
});
