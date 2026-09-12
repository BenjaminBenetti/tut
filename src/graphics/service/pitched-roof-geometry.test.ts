/// <reference types="node" />
import { readFileSync } from "node:fs";
import {
  Box3,
  InstancedMesh,
  Mesh,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  Raycaster,
  Texture,
  Vector3,
  OrthographicCamera,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import type { ModelLoader } from "../model/model-loader";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { HIPPED_ROOF_MODEL, PITCHED_ROOF_MODEL } from "../data/map-model-table";
import { PITCHED_ROOF_STYLE } from "../data/pitched-roof-style";
import { TacticalMapView, tileTop } from "../view/tactical-map-view";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { resolveMapModels, mapModelIds } from "./map-model-resolver";
import { createGhostUniforms } from "./ghost-cutaway";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { DEFAULT_MISSION_HOOKS } from "../../mapgen/data/hook-requirements";
/** Uses shipped positions, normals and UVs; image decoding is unnecessary for ray tests. */
function shippedModels(): ModelLoader {
  const cache = new Map<ModelAssetId, Promise<Object3D>>();
  const parser = new GLTFLoader().register(() => ({
    name: "geometry-test-texture",
    loadTexture: () => Promise.resolve(new Texture()),
  }));
  /** Shares loaded prototypes exactly as the scene loader does. */
  async function load(id: ModelAssetId): Promise<Object3D> {
    let value = cache.get(id);
    if (!value) {
      const bytes = readFileSync(`public/${MODEL_MANIFEST[id].path}`);
      value = parser
        .parseAsync(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
          "",
        )
        .then((gltf) => gltf.scene);
      cache.set(id, value);
    }
    return (await value).clone(true);
  }
  return {
    load,
    preload: async (ids) => {
      await Promise.all(ids.map(load));
    },
  };
}

/** A pitched house with a stairwell hole in its upper storey. */
function house(w: number, d: number, hipped = false) {
  // Stable building hashes explicitly select both available silhouette families.
  const id = hipped ? "building-1" : "gabled-house";
  const b = new FixtureMapBuilder(w + 2, d + 2, 4).fillGround(0, "grass");
  for (let z = 1; z <= d; z++)
    for (let x = 1; x <= w; x++) {
      b.tile({ x, y: 0, z }, "floor", { buildingId: id, floorIndex: 0 });
      if (x !== 2 || z !== 2)
        b.tile({ x, y: 2, z }, "floor", { buildingId: id, floorIndex: 1 });
    }
  b.building({
    id,
    kind: "house",
    footprint: [{ x: 1, z: 1, w, d }],
    groundLevel: 0,
    floors: [
      { index: 0, y: 0, rooms: [] },
      { index: 1, y: 2, rooms: [] },
    ],
    roof: { kind: "pitched", walkable: false },
    entrances: [],
    connectorIds: [],
  });
  const map = b.build();
  return hipped
    ? {
        ...map,
        recipe: {
          ...map.recipe,
          params: {
            ...map.recipe.params,
            placeProfile: "johannesburg" as const,
          },
        },
      }
    : map;
}

/** Only the live roof parts, after the normal loader/instancer/vision path. */
function roofs(view: TacticalMapView): InstancedMesh[] {
  const result: InstancedMesh[] = [];
  view.root.traverse((o) => {
    if (o instanceof InstancedMesh && o.name.startsWith("roofs-model:"))
      result.push(o as InstancedMesh);
  });
  return result;
}

describe("pitched roof shelter (#916)", () => {
  const models = shippedModels();
  it("ships a textured, closed-profile cap with its base at the wall line", async () => {
    const source = await models.load(PITCHED_ROOF_MODEL);
    const bounds = new Box3().setFromObject(source);
    expect(bounds.min.toArray()).toEqual([-0.5, 0, -0.5]);
    expect(bounds.max.x).toBe(0.5);
    expect(bounds.max.z).toBe(0.5);
    expect(bounds.max.y).toBeCloseTo(MODEL_MANIFEST[PITCHED_ROOF_MODEL].height);
    source.traverse((o) => {
      if (o instanceof Mesh)
        expect(
          ((o as Mesh).material as MeshStandardMaterial).map,
        ).not.toBeNull();
    });
  });

  for (const [w, d, hipped] of [
    [4, 7, false],
    [5, 8, false],
    [7, 4, false],
    [8, 5, false],
    [5, 8, true],
  ] as const) {
    it(`${hipped ? "hipped" : "gabled"} ${w}×${d}: continuous shelter across both ridge axes, including odd widths and the stairwell`, async () => {
      const map = house(w, d, hipped),
        original = JSON.stringify(map),
        index = new TileIndex(map);
      const placements = resolveMapModels(map);
      expect(placements.roofs).toHaveLength(w * d);
      expect(placements.roofs.every((p) => index.has(p.tile))).toBe(true);
      expect(
        placements.roofs.find((p) => p.tile.x === 2 && p.tile.z === 2)?.tile.y,
      ).toBe(0);
      expect(mapModelIds(placements)).toContain(
        hipped ? HIPPED_ROOF_MODEL : PITCHED_ROOF_MODEL,
      );
      const uniforms = createGhostUniforms(4, 0.175);
      const view = new TacticalMapView(map, uniforms);
      view.setMaxLevel(2); // Called before asynchronous art introduces visual roof layer 4.
      await view.loadModels(models);
      expect(view.root.getObjectByName("level-4")?.visible).toBe(false);
      view.setMaxLevel(undefined);
      expect(view.root.getObjectByName("level-4")?.visible).toBe(true);
      view.root.updateMatrixWorld(true);
      const meshes = roofs(view),
        bounds = new Box3();
      for (const mesh of meshes) bounds.expandByObject(mesh);
      expect(bounds.min.y).toBeCloseTo(tileTop(4));
      expect(bounds.max.y).toBeCloseTo(
        tileTop(4) + 0.12 + (Math.min(w, d) * 0.25) / 2,
      );
      // Ray-sample inside cells and either side of every seam; every sample
      // meets the continuous roof profile before any interior floor can be hit.
      for (let z = 1.03; z < d + 0.99; z += 0.23)
        for (let x = 1.03; x < w + 0.99; x += 0.23) {
          const u = w <= d ? x - 1 : z - 1,
            width = Math.min(w, d);
          const expected =
            tileTop(4) +
            PITCHED_ROOF_STYLE.eaveThickness +
            (hipped
              ? Math.min(x - 1, w + 1 - x, z - 1, d + 1 - z)
              : Math.min(u, width - u)) *
              PITCHED_ROOF_STYLE.risePerTile;
          const hits = new Raycaster(
            new Vector3(x, 20, z),
            new Vector3(0, -1, 0),
          ).intersectObjects(meshes);
          expect(hits.length, `${x},${z}`).toBeGreaterThan(0);
          expect(hits[0]!.point.y).toBeCloseTo(expected, 5);
        }
      // Roof art stays in the building cutaway program. All profiles share
      // the same scene material, including mist, rather than clone per batch.
      const materials = new Set(meshes.map((m) => m.material));
      expect(materials.size).toBe(1);
      const material = meshes[0]!.material as Material;
      expect(material.customProgramCacheKey()).toContain("ghost-cutaway");
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <project_vertex>",
        fragmentShader: "#include <common>\n#include <dithering_fragment>",
      };
      material.onBeforeCompile(shader as never, {} as never);
      expect((shader.uniforms as Record<string, unknown>).uGhostCount).toBe(
        uniforms.uGhostCount,
      );
      expect((shader.uniforms as Record<string, unknown>).uGhostStrength).toBe(
        uniforms.uGhostStrength,
      );
      expect(shader.fragmentShader).toContain("discard");
      view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
      expect(
        meshes.every(
          (m) => m.geometry.getAttribute("unexploredMist").getW(0) === 1,
        ),
      ).toBe(true);
      const known = index.keyOf({ x: 2, y: 0, z: 2 });
      view.setVision({
        visible: [known],
        explored: [known],
        spotted: [],
        lastSeen: {},
      });
      const clear = meshes.reduce((sum, mesh) => {
        const mist = mesh.geometry.getAttribute("unexploredMist");
        let count = 0;
        for (let i = 0; i < mesh.count; i++) if (mist.getW(i) === 0) count++;
        return sum + count;
      }, 0);
      expect(clear).toBe(1); // Only the cap over the known stairwell column clears.
      const keys = map.tiles.map((t) => index.keyOf(t));
      view.setVision({
        visible: keys,
        explored: keys,
        spotted: [],
        lastSeen: {},
      });
      expect(
        meshes.every(
          (m) => m.geometry.getAttribute("unexploredMist").getW(0) === 0,
        ),
      ).toBe(true);
      // No standable roof tile is added, including through the public picker.
      const camera = new OrthographicCamera(-w, w, d, -d, 0.1, 50);
      camera.position.set(1 + w / 2, 20, 1 + d / 2);
      camera.up.set(0, 0, -1);
      camera.lookAt(1 + w / 2, 0, 1 + d / 2);
      camera.updateMatrixWorld(true);
      expect(view.pickTile({ x: 0, y: 0 }, camera)).toBeUndefined();
      expect(JSON.stringify(map)).toBe(original);
      view.dispose();
    });
  }
  for (const biome of ["temperate", "snowy"] as const)
    it(`${biome}: covers all 120 house cells without changing map data`, () => {
      const map = generateTacticalMap({
        seed: "mc-opening-01",
        params: {
          archetype: "settlement",
          biome,
          settlement: "rural",
          size: "small",
          hooks: DEFAULT_MISSION_HOOKS,
          slopeShare: 1,
        },
      });
      const original = JSON.stringify(map),
        placements = resolveMapModels(map);
      expect(placements.roofs).toHaveLength(120);
      expect(
        map.buildings.every(
          (b) => b.roof.kind === "pitched" && !b.roof.walkable,
        ),
      ).toBe(true);
      expect(map.tiles.filter((t) => t.surface === "roof")).toHaveLength(0);
      expect(JSON.stringify(map)).toBe(original);
    });
  it("leaves the existing flat-roof control on its unchanged tile/art path", () => {
    const map = generateTacticalMap({
      seed: "mc-opening-02",
      params: {
        archetype: "settlement",
        biome: "temperate",
        settlement: "town",
        size: "small",
        hooks: DEFAULT_MISSION_HOOKS,
        slopeShare: 1,
      },
    });
    const placements = resolveMapModels(map);
    expect(placements.roofs).toHaveLength(0);
    expect(
      placements.tiles.filter((p) => p.modelId === "building.roof"),
    ).toHaveLength(294);
  });
});
