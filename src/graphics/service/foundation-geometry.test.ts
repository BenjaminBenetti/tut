/// <reference types="node" />
import { readFileSync } from "node:fs";
import {
  Box3,
  InstancedMesh,
  Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Raycaster,
  Texture,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import type { ModelLoader } from "../model/model-loader";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { FOUNDATION_MODEL } from "../data/map-model-table";
import { LAYER_HEIGHT } from "../data/mapgen-preview-palette";
import { TacticalMapView, tileTop } from "../view/tactical-map-view";
import { TileIndex } from "../../mapgen/service/tile-index";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { resolveMapModels, mapModelIds } from "./map-model-resolver";
import { foundationHeight } from "./foundation-model-resolver";
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

/** One raised building column beside lower ground, with an upper floor kept hollow. */
function buildingColumn(base: number, surface = "floor") {
  const b = new FixtureMapBuilder(3, 3, base + 5).fillGround(0, "grass");
  b.removeTile({ x: 1, y: 0, z: 1 });
  b.tile({ x: 1, y: base, z: 1 }, surface, {
    buildingId: "building-1",
    floorIndex: 0,
  });
  b.tile({ x: 1, y: base + 2, z: 1 }, "floor", {
    buildingId: "building-1",
    floorIndex: 1,
  });
  b.tile({ x: 1, y: base + 4, z: 1 }, "roof", { buildingId: "building-1" });
  return b.build();
}

/** Collects only the rendered support meshes, excluding floors and neighbouring terrain. */
function supports(view: TacticalMapView): InstancedMesh[] {
  const meshes: InstancedMesh[] = [];
  view.root.traverse((o) => {
    if (o instanceof InstancedMesh && o.name.startsWith("foundations-model:"))
      meshes.push(o as InstancedMesh);
  });
  return meshes;
}

describe("building foundations (#906)", () => {
  const models = shippedModels();
  it("ships a textured, base-centred course at the shared rise", async () => {
    const model = await models.load(FOUNDATION_MODEL),
      box = new Box3().setFromObject(model);
    expect(box.min.toArray()).toEqual([-0.5, 0, -0.5]);
    expect(box.max.toArray()).toEqual([0.5, LAYER_HEIGHT, 0.5]);
    model.traverse((o) => {
      if (o instanceof Mesh)
        expect(
          ((o as Mesh).material as MeshStandardMaterial).map,
        ).not.toBeNull();
    });
  });
  for (const base of [0, 1, 2, 4])
    for (const surface of ["floor", "stairs"])
      it(`${surface} at layer ${base}: closes the solid volume, retaining hollow floors and cutaways`, async () => {
        const map = buildingColumn(base, surface),
          index = new TileIndex(map),
          original = JSON.stringify(map);
        const tile = index.getAt({ x: 1, y: base, z: 1 })!,
          height = foundationHeight(tile);
        const placed = resolveMapModels(map);
        expect(
          placed.foundations.every(
            (p) => p.tile.x === 1 && p.tile.z === 1 && p.level === base,
          ),
        ).toBe(true);
        expect(
          mapModelIds(placed).filter((id) => id === FOUNDATION_MODEL),
        ).toHaveLength(1);
        const view = new TacticalMapView(map, createGhostUniforms(1, 0.15));
        const fallback = view.root.getObjectByName(
          `foundations:foundation:${base}`,
        )!;
        expect(fallback.visible).toBe(true);
        await view.loadModels(models);
        view.root.updateMatrixWorld(true);
        const meshes = supports(view);
        expect(meshes).toHaveLength(1);
        const box = new Box3().setFromObject(meshes[0]!);
        expect(box.min.x).toBeCloseTo(1, 6);
        expect(box.min.y).toBeCloseTo(0, 6);
        expect(box.min.z).toBeCloseTo(1, 6);
        expect(box.max.x).toBeCloseTo(2, 6);
        expect(box.max.z).toBeCloseTo(2, 6);
        expect(box.max.y).toBeCloseTo(height, 6);
        // Actual shipped floor/stairs geometry meets the top of the support exactly.
        const surfaceMeshes: InstancedMesh[] = [];
        view.root.traverse((o) => {
          if (
            o instanceof InstancedMesh &&
            o.name.startsWith(
              `tiles-model:building.${surface === "stairs" ? "stairs" : "floor"}:${base}:`,
            )
          )
            surfaceMeshes.push(o as InstancedMesh);
        });
        expect(surfaceMeshes.length).toBeGreaterThan(0);
        const surfaceBox = new Box3();
        for (const mesh of surfaceMeshes) surfaceBox.expandByObject(mesh);
        expect(surfaceBox.min.y).toBeCloseTo(box.max.y, 6);
        // No side can see into the former void, including between repeated courses.
        for (const [x, z, dx, dz] of [
          [1.5, 0, 0, 1],
          [3, 1.5, -1, 0],
          [1.5, 3, 0, -1],
          [0, 1.5, 1, 0],
        ])
          for (let h = 0.025; h < height; h += 0.075) {
            const hits = new Raycaster(
              new Vector3(x, h, z),
              new Vector3(dx, 0, dz),
            ).intersectObjects(meshes);
            expect(hits.length, `side ${dx},${dz} at ${h}`).toBeGreaterThan(0);
          }
        expect(
          new Raycaster(
            new Vector3(1.5, tileTop(base) + 0.5, 0),
            new Vector3(0, 0, 1),
          ).intersectObjects(meshes),
        ).toHaveLength(0);
        const material = meshes[0]!.material as MeshStandardMaterial;
        expect(material.customProgramCacheKey()).not.toContain("ghost-cutaway");
        expect(fallback.visible).toBe(false);
        view.setVision({
          visible: [],
          explored: [],
          spotted: [],
          lastSeen: {},
        });
        expect(meshes[0]!.geometry.getAttribute("unexploredMist").getW(0)).toBe(
          1,
        );
        view.setVision({
          visible: [index.keyOf(tile)],
          explored: [index.keyOf(tile)],
          spotted: [],
          lastSeen: {},
        });
        expect(meshes[0]!.geometry.getAttribute("unexploredMist").getW(0)).toBe(
          0,
        );
        expect(fallback.visible).toBe(false);
        view.setMaxLevel(base);
        expect(view.root.getObjectByName(`level-${base}`)?.visible).toBe(true);
        expect(view.root.getObjectByName(`level-${base + 2}`)?.visible).toBe(
          false,
        );
        expect(JSON.stringify(map)).toBe(original);
        view.dispose();
      });
  it("shares the source material and mist material across foundation elevations", async () => {
    const fields = [buildingColumn(0), buildingColumn(2), buildingColumn(4)];
    const map = {
      ...fields[0]!,
      width: 12,
      levels: 9,
      tiles: fields.flatMap((m, i) =>
        m.tiles.map((t) => ({ ...t, x: t.x + 4 * i })),
      ),
    };
    const source = await models.load(FOUNDATION_MODEL);
    let original: MeshStandardMaterial | undefined;
    source.traverse((o) => {
      if (o instanceof Mesh)
        original = (o as Mesh).material as MeshStandardMaterial;
    });
    const originalKey = original!.customProgramCacheKey();
    const view = new TacticalMapView(map);
    await view.loadModels(models);
    const meshes = supports(view);
    expect(meshes).toHaveLength(3);
    expect(new Set(meshes.map((m) => m.material)).size).toBe(1);
    expect(original!.customProgramCacheKey()).toBe(originalKey);
    view.dispose();
  });
  for (const [biome, seed, x, y, z] of [
    ["snowy", "mc-opening-01", 36, 4, 39],
    ["desert", "mc-opening-02", 31, 2, 17],
  ] as const)
    it(`${biome}: supports the exact reported building without changing its map record`, () => {
      const map = generateTacticalMap({
        seed,
        params: {
          archetype: "settlement",
          biome,
          settlement: "town",
          size: "small",
          hooks: DEFAULT_MISSION_HOOKS,
          slopeShare: 1,
        },
      });
      const original = JSON.stringify(map),
        placements = resolveMapModels(map);
      const at = placements.foundations.filter(
        (p) => p.tile.x === x && p.tile.z === z,
      );
      expect(at).toHaveLength(y + 1);
      expect(at.every((p) => p.level === y)).toBe(true);
      expect(at[0]!.position.y).toBe(0);
      const top = Math.max(
        ...at.map(
          (p) =>
            p.position.y + MODEL_MANIFEST[FOUNDATION_MODEL].height * p.scaleY!,
        ),
      );
      expect(top).toBeCloseTo(
        tileTop(y) - MODEL_MANIFEST["building.floor"].height / 2,
        6,
      );
      expect(JSON.stringify(map)).toBe(original);
    });
});
