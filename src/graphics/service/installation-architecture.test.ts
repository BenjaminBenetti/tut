/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Raycaster, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { PassMask } from "../../mapgen/model/pass-mask";
import { MISSION_SITES } from "../../mapgen/data/mission-sites";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { TileIndex } from "../../mapgen/service/tile-index";
import { BUILDING_FURNITURE_CLEARANCE } from "../data/interior-furniture-style";
import { BUILDING_WALL_FAMILIES, wallModel } from "../data/map-model-table";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { resolveMapModels } from "./map-model-resolver";

describe("installation architectural kits", () => {
  for (const [kind, family] of Object.entries(BUILDING_WALL_FAMILIES)) {
    it.each(["solid", "window", "door"] as const)(
      `${kind} %s fits the existing edge and keeps the doorway clear`,
      async (wall) => {
        const model = MODEL_MANIFEST[wallModel(wall, family)];
        const data = readFileSync(
          new URL(`../../../public/${model.path}`, import.meta.url),
        );
        const scene = (
          await new GLTFLoader().parseAsync(Uint8Array.from(data).buffer, "")
        ).scene;
        scene.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(scene);
        expect(bounds.min.x).toBeCloseTo(-0.5, 5);
        expect(bounds.max.x).toBeCloseTo(0.5, 5);
        expect(bounds.min.y).toBeCloseTo(0, 5);
        expect(bounds.max.y).toBeCloseTo(1.5, 5);
        expect(Math.max(-bounds.min.z, bounds.max.z)).toBeLessThan(
          BUILDING_FURNITURE_CLEARANCE[kind]!,
        );
        if (wall === "door") {
          expect(scene.getObjectByName("socket_door")).toBeDefined();
          for (const direction of [-1, 1]) {
            for (const x of [-0.29, 0, 0.29]) {
              for (const y of [0.1, 0.9, 1.19]) {
                const ray = new Raycaster(
                  new Vector3(x, y, direction),
                  new Vector3(0, 0, -direction),
                );
                expect(ray.intersectObject(scene, true), `${x},${y}`).toEqual(
                  [],
                );
              }
            }
          }
        }
      },
    );
  }

  it.each(Object.values(MISSION_SITES))(
    "$id keeps modular ownership and applies its kit through every storey",
    (site) => {
      const map = generateTacticalMap({
        seed: "installation-review",
        params: {
          archetype: "settlement",
          biome: "temperate",
          settlement: "town",
          size: "medium",
          site: site.id,
          hooks: [
            { kind: "deploy", count: 1, requiredPass: PassMask.ALL },
            { kind: "extraction", count: 1, requiredPass: PassMask.ALL },
            { kind: "edge-spawn", count: 3, requiredPass: PassMask.INFANTRY },
            {
              kind: "generator",
              count: site.objectives.length,
              requiredPass: PassMask.INFANTRY,
            },
          ],
        },
      });
      const before = JSON.stringify(map);
      const placements = resolveMapModels(map);
      const index = new TileIndex(map);
      const buildings = map.buildings.filter(
        (building) => building.kind === site.id,
      );
      for (const building of buildings) {
        // The ground north/west edges can be owned by adjacent outdoor tiles.
        const footprint = building.footprint[0]!;
        const walls = placements.walls.filter(
          (wall) =>
            wall.position.x >= footprint.x &&
            wall.position.x <= footprint.x + footprint.w &&
            wall.position.z >= footprint.z &&
            wall.position.z <= footprint.z + footprint.d,
        );
        const models = new Set(
          ["solid", "window", "door"].map((kind) =>
            wallModel(
              kind as "solid" | "window" | "door",
              BUILDING_WALL_FAMILIES[site.id]!,
            ),
          ),
        );
        expect(walls.length).toBeGreaterThan(20);
        expect(walls.every((wall) => models.has(wall.modelId))).toBe(true);
        expect(new Set(walls.map((wall) => wall.level)).size).toBe(
          building.floors.length,
        );
      }
      if (site.id === "bank") {
        expect(
          map.props.filter((prop) => prop.kind === "marble-pillar").length,
        ).toBeGreaterThanOrEqual(2);
        expect(
          placements.tiles.some(
            (tile) => tile.interiorFloor?.finish === "marble",
          ),
        ).toBe(true);
      }
      if (site.id === "defensive-battery") {
        const barriers = map.props.filter(
          (prop) => prop.kind === "blast-barrier",
        );
        expect(barriers).toHaveLength(16);
        expect(
          barriers.every((prop) => index.getAt(prop.tile)?.pass === 0),
        ).toBe(true);
        expect(
          placements.tiles.some(
            (tile) => tile.interiorFloor?.finish === "steel",
          ),
        ).toBe(true);
      }
      expect(JSON.stringify(map)).toBe(before);
    },
  );
});
