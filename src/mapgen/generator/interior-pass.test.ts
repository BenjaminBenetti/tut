import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { rectContains, rectsOverlap } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import type { Building } from "../model/building";
import type { BuildingTemplate } from "../model/building-template";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams, MapRecipe } from "../model/map-recipe";
import type { TacticalMap } from "../model/tactical-map";
import type { MapGenRegistries } from "../model/registries";
import { createDefaultRegistries } from "../service/default-registries";
import { createRegistry } from "../service/definition-registry";
import { freezeDraft } from "../service/draft-freezer";
import type { InvariantId, Violation } from "../service/map-validator";
import { validateTacticalMap } from "../service/map-validator";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { BuildingPass } from "./building-pass";
import { InteriorPass } from "./interior-pass";
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
    new InteriorPass(),
  ],
  registries,
);

const STRUCTURAL: readonly InvariantId[] = ["I1", "I2", "I3", "I4", "I5"];

function run(
  biome: MapGenParams["biome"],
  settlement: MapGenParams["settlement"],
  seed: string,
): { draft: MapDraft; map: TacticalMap } {
  const params: MapGenParams = {
    archetype: "settlement",
    biome,
    settlement,
    size: "medium",
    hooks: [],
  };
  const recipe: MapRecipe = { seed, params };
  const { draft } = generator.run(params, new Mulberry32Rng(hashSeed(seed)));
  return { draft, map: freezeDraft(draft, recipe, registries) };
}

function structuralViolations(map: TacticalMap): Violation[] {
  return validateTacticalMap(map, registries).filter((v) =>
    STRUCTURAL.includes(v.invariant),
  );
}

function expectedFlights(building: Building): number {
  return building.floors.length - 1 + (building.roof.walkable ? 1 : 0);
}

const SEEDS = 6;

describe("InteriorPass", () => {
  it("produces structurally valid buildings (I1–I5) across scales and biomes", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      for (const biome of BIOME_IDS) {
        for (let i = 0; i < SEEDS; i++) {
          const label = `${settlement}/${biome}/${i}`;
          const { map } = run(biome, settlement, `interior-${i}`);
          const violations = structuralViolations(map);
          expect(
            violations.map((v) => `${v.invariant}: ${v.message}`),
            label,
          ).toEqual([]);
        }
      }
    }
  });

  it("tiles every floor with rooms that carry ids and kinds", () => {
    for (let i = 0; i < SEEDS; i++) {
      const { draft } = run("temperate", "city", `rooms-${i}`);
      for (const building of draft.buildings) {
        const footprint = building.footprint[0];
        if (footprint === undefined) continue;
        for (const floor of building.floors) {
          expect(floor.rooms.length, building.id).toBeGreaterThan(0);
          const area = floor.rooms.reduce(
            (sum, r) => sum + r.rect.w * r.rect.d,
            0,
          );
          expect(area, building.id).toBe(footprint.w * footprint.d);
          for (let a = 0; a < floor.rooms.length; a++) {
            for (let b = a + 1; b < floor.rooms.length; b++) {
              const ra = floor.rooms[a];
              const rb = floor.rooms[b];
              if (ra && rb)
                expect(rectsOverlap(ra.rect, rb.rect), building.id).toBe(false);
            }
          }
          for (const tile of draft.tilesOfBuilding(building.id)) {
            if (tile.y !== floor.y) continue;
            const room = floor.rooms.find((r) =>
              rectContains(r.rect, tile.x, tile.z),
            );
            expect(
              room,
              `${building.id} tile ${tile.x},${tile.y},${tile.z}`,
            ).toBeDefined();
            expect(tile.roomId, building.id).toBe(room?.id);
          }
        }
        const hall = building.floors[0]?.rooms.find((r) => r.kind === "hall");
        if (building.kind === "warehouse") {
          expect(
            building.floors[0]?.rooms.every((r) => r.kind === "storage"),
            building.id,
          ).toBe(true);
        } else {
          expect(hall, building.id).toBeDefined();
        }
      }
    }
  });

  it("joins every consecutive pair of levels with stairs and adds roofs where walkable", () => {
    let flights = 0;
    let roofs = 0;
    let ladders = 0;
    for (let i = 0; i < SEEDS; i++) {
      const { draft } = run("desert", "town", `stairs-${i}`);
      for (const building of draft.buildings) {
        const own = draft.connectors.filter((c) =>
          building.connectorIds.includes(c.id),
        );
        const stairs = own.filter((c) => c.kind === "stairs");
        expect(stairs.length, building.id).toBe(expectedFlights(building));
        flights += stairs.length;
        for (const flight of stairs) {
          expect(draft.getTile(flight.from)?.surface, building.id).toBe(
            SurfaceIds.STAIRS,
          );
          expect(
            draft.getTile({ ...flight.from, y: flight.to.y }),
            building.id,
          ).toBeUndefined();
          expect(flight.to.y - flight.from.y).toBe(1);
        }
        const roofY = building.groundLevel + building.floors.length;
        const roofTiles = draft
          .tilesOfBuilding(building.id)
          .filter((t) => t.surface === SurfaceIds.ROOF);
        if (building.roof.walkable) {
          roofs++;
          const footprint = building.footprint[0];
          expect(roofTiles.length, building.id).toBe(
            (footprint?.w ?? 0) * (footprint?.d ?? 0) - 1,
          );
          expect(roofTiles.every((t) => t.y === roofY)).toBe(true);
        } else {
          expect(roofTiles, building.id).toHaveLength(0);
        }
        ladders += own.filter((c) => c.kind === "ladder").length;
      }
    }
    expect(flights).toBeGreaterThan(0);
    expect(roofs).toBeGreaterThan(0);
    expect(ladders).toBeGreaterThan(0);
  });

  it("keeps stairwell holes off the facade when the footprint allows", () => {
    const provides: DraftCapability[] = ["heightmap", "water", "roads", "lots"];
    const oneLot: GenerationPass = {
      id: "one-lot",
      requires: [],
      provides,
      run: (ctx: GenerationContext): void => {
        for (let i = 4; i <= 15; i++) {
          ctx.draft.setRoad(i, 4);
        }
        ctx.draft.lots.push({
          id: "lot-1",
          rect: { x: 6, z: 6, w: 8, d: 8 },
          level: 0,
          frontage: "n",
        });
      },
    };
    const box: BuildingTemplate = {
      id: "house",
      footprintWidth: { min: 5, max: 5 },
      footprintDepth: { min: 5, max: 5 },
      floors: { min: 2, max: 2 },
      roof: "pitched",
      roofWalkable: false,
      windowDensity: 0.5,
      scales: ["rural", "town", "city"],
      minRoomSize: 2,
    };
    const regs: MapGenRegistries = {
      ...registries,
      buildingTemplates: createRegistry("building template", [box]),
      biomes: createRegistry("biome", [
        {
          ...registries.biomes.get("temperate"),
          buildingKinds: [{ template: "house", weight: 1 }],
        },
      ]),
    };
    for (let i = 0; i < 10; i++) {
      const { draft } = new PipelineMapGenerator(
        [oneLot, new BuildingPass(), new InteriorPass()],
        regs,
      ).run(
        {
          archetype: "settlement",
          biome: "temperate",
          settlement: "town",
          size: { width: 20, depth: 20 },
          hooks: [],
        },
        new Mulberry32Rng(hashSeed(`stairwell-${i}`)),
      );
      const stairs = draft.connectors.find((c) => c.kind === "stairs");
      expect(stairs, `seed ${i}`).toBeDefined();
      if (stairs === undefined) continue;
      const hole = { x: stairs.from.x, z: stairs.from.z };
      const onEdge =
        hole.x === 6 || hole.x === 10 || hole.z === 6 || hole.z === 10;
      expect(onEdge, `seed ${i} hole at ${hole.x},${hole.z}`).toBe(false);
    }
  });

  it("is deterministic per seed", () => {
    const a = run("snowy", "town", "det");
    const b = run("snowy", "town", "det");
    expect(a.map).toEqual(b.map);
  });
});
