/// <reference types="node" />
import { readFileSync } from "node:fs";
import {
  Box3,
  InstancedMesh,
  Mesh,
  type MeshStandardMaterial,
  Raycaster,
  Texture,
  Vector3,
} from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import type { ModelLoader } from "../model/model-loader";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { LADDER_ATLAS_U_OFFSET } from "../data/ladder-styles";
import { LADDER_CONNECTOR_MODEL } from "../data/map-model-table";
import { LAYER_HEIGHT } from "../data/mapgen-preview-palette";
import { TacticalMapView, tileTop } from "../view/tactical-map-view";
import { TileIndex } from "../../mapgen/service/tile-index";
import { ladderFacade } from "./ladder-fixture.test-helper";
import { resolveMapModels } from "./map-model-resolver";
import { LadderModelFactory } from "./ladder-model-factory";
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

describe("shipped ladder connector (#891)", () => {
  const models = shippedModels();
  it("keeps the repeatable rise, base pivot, textured steel and wall-plate footprint", async () => {
    const model = await models.load(LADDER_CONNECTOR_MODEL);
    const box = new Box3().setFromObject(model);
    for (const [i, v] of [-0.175, 0, -0.08].entries())
      expect(box.min.getComponent(i)).toBeCloseTo(v, 6);
    for (const [i, v] of [0.175, LAYER_HEIGHT, 0.08].entries())
      expect(box.max.getComponent(i)).toBeCloseTo(v, 6);
    model.traverse((o) => {
      if (o instanceof Mesh)
        expect(
          ((o as Mesh).material as MeshStandardMaterial).map,
        ).not.toBeNull();
    });
  });
  for (const layers of [2, 3, 4, 8])
    for (const family of ["brick", "concrete"] as const)
      for (const turns of [0, 1, 2, 3] as const)
        it(`${family}, ${layers} layers, turn ${turns}: fixed rung spacing, exact height and permanent retirement`, async () => {
          const map = ladderFacade(layers, family, turns),
            index = new TileIndex(map);
          const before = JSON.stringify(map),
            c = map.connectors[0]!;
          const placements = resolveMapModels(map);
          const sections = placements.connectors.filter((p) => p.ladder);
          expect(sections).toHaveLength(layers);
          expect(new Set(sections.map((p) => p.ladder!.finish))).toEqual(
            new Set([family === "brick" ? "weathered" : "brushed"]),
          );
          const view = new TacticalMapView(map);
          expect(view.root.getObjectByName(c.id)?.visible).toBe(true);
          await view.loadModels(models);
          view.root.updateMatrixWorld(true);
          const meshes: InstancedMesh[] = [];
          view.root.traverse((o) => {
            if (
              o instanceof InstancedMesh &&
              o.name.startsWith("ladders-model:")
            )
              meshes.push(o as InstancedMesh);
          });
          expect(meshes).toHaveLength(1);
          expect(meshes[0]!.count).toBe(layers);
          const box = new Box3().setFromObject(meshes[0]!);
          expect(box.min.y).toBeCloseTo(tileTop(c.from.y), 5);
          expect(box.max.y).toBeCloseTo(tileTop(c.to.y), 5);
          // The back plate reaches the facade's outer plane, with the rungs in front.
          expect(
            [
              box.max.z,
              map.width - box.min.x,
              map.depth - box.min.z,
              box.max.x,
            ][turns],
          ).toBeCloseTo(1.95, 5);
          expect(
            placements.tiles.some(
              (p) => index.keyOf(p.tile) === index.keyOf(c.from),
            ),
          ).toBe(true);
          /** Looks at a rung through the real instanced GLB, rotated with the wall. */
          function hitAt(height: number): boolean {
            let x = 3.5,
              z = 0;
            const direction = new Vector3(0, 0, 1);
            for (let i = 0; i < turns; i++) {
              [x, z] = [map.width - z, x];
              direction.set(-direction.z, 0, direction.x);
            }
            return (
              new Raycaster(
                new Vector3(x, height, z),
                direction,
              ).intersectObjects(meshes).length > 0
            );
          }
          for (let i = 0; i < layers * 5; i++) {
            const y = tileTop(c.from.y) + 0.075 + i * 0.15;
            expect(hitAt(y), `rung ${i}`).toBe(true);
            expect(hitAt(y + 0.06), `gap after rung ${i}`).toBe(false);
          }
          expect(view.root.getObjectByName(c.id)?.visible).toBe(false);
          view.setVision({
            visible: [index.keyOf(c.from)],
            explored: [],
            spotted: [],
            lastSeen: {},
          });
          expect(
            meshes[0]!.geometry.getAttribute("unexploredMist").getW(0),
          ).toBe(1);
          view.setVision({
            visible: [index.keyOf(c.to)],
            explored: [index.keyOf(c.to)],
            spotted: [],
            lastSeen: {},
          });
          expect(
            meshes[0]!.geometry.getAttribute("unexploredMist").getW(0),
          ).toBe(0);
          expect(view.root.getObjectByName(c.id)?.visible).toBe(false);
          view.setMaxLevel(c.to.y - 1);
          expect(view.root.getObjectByName(`level-${c.to.y}`)?.visible).toBe(
            false,
          );
          expect(JSON.stringify(map)).toBe(before);
          view.dispose();
        });
  it("shares prototypes and mist materials across finishes and elevation batches", async () => {
    const fields = [
      ladderFacade(2, "brick"),
      ladderFacade(4, "brick"),
      ladderFacade(2, "concrete"),
      ladderFacade(4, "concrete"),
    ];
    const map = {
      ...fields[0]!,
      width: 34,
      levels: 5,
      tiles: fields.flatMap((m, i) =>
        m.tiles.map((t) => ({ ...t, x: t.x + i * 9 })),
      ),
      connectors: fields.flatMap((m, i) =>
        m.connectors.map((c) => ({
          ...c,
          id: `${i}-${c.id}`,
          from: { ...c.from, x: c.from.x + i * 9 },
          to: { ...c.to, x: c.to.x + i * 9 },
        })),
      ),
    };
    const loads: ModelAssetId[] = [];
    const view = new TacticalMapView(map);
    await view.loadModels({
      ...models,
      load: async (id) => {
        loads.push(id);
        return models.load(id);
      },
    });
    const meshes: InstancedMesh[] = [];
    view.root.traverse((o) => {
      if (o instanceof InstancedMesh && o.name.startsWith("ladders-model:"))
        meshes.push(o as InstancedMesh);
    });
    expect(meshes).toHaveLength(4);
    expect(meshes.map((m) => m.count).sort()).toEqual([2, 2, 4, 4]);
    expect(new Set(meshes.map((m) => m.material)).size).toBe(1);
    expect(loads.filter((id) => id === LADDER_CONNECTOR_MODEL)).toHaveLength(2);
    view.dispose();
  });
  it("keeps the finish offsets aligned with the shared atlas layout", () => {
    const layout = JSON.parse(
      readFileSync("tools/art/atlas-cells.json", "utf8"),
    ) as {
      grid: number;
      cells: Record<string, { atlas: string; col: number; row: number }>;
    };
    const metal = layout.cells["env-metal"]!,
      rust = layout.cells["env-rust"]!;
    expect(rust.atlas).toBe(metal.atlas);
    expect(rust.row).toBe(metal.row);
    expect(
      LADDER_ATLAS_U_OFFSET.weathered - LADDER_ATLAS_U_OFFSET.brushed,
    ).toBe((rust.col - metal.col) / layout.grid);
  });
  it("changes atlas cell without cloning materials or mutating the loader prototype", async () => {
    const prototype = await models.load(LADDER_CONNECTOR_MODEL);
    let source!: Mesh;
    prototype.traverse((o) => {
      if (o instanceof Mesh) source = o as Mesh;
    });
    const original = Array.from(source.geometry.getAttribute("uv").array);
    const factory = new LadderModelFactory(models);
    const brushed = await factory.create("brushed"),
      weathered = await factory.create("weathered");
    let first!: Mesh, second!: Mesh;
    brushed.traverse((o) => {
      if (o instanceof Mesh) first = o as Mesh;
    });
    weathered.traverse((o) => {
      if (o instanceof Mesh) second = o as Mesh;
    });
    expect(first.material).toBe(source.material);
    expect(second.material).toBe(source.material);
    const a = first.geometry.getAttribute("uv"),
      b = second.geometry.getAttribute("uv");
    for (let i = 0; i < a.count; i++) {
      expect(b.getX(i) - a.getX(i)).toBeCloseTo(0.25, 6);
      expect(b.getY(i)).toBe(a.getY(i));
    }
    expect(Array.from(source.geometry.getAttribute("uv").array)).toEqual(
      original,
    );
    first.geometry.dispose();
    second.geometry.dispose();
  });
  it("uses the actual ground-floor brickwork instead of the owning building's concrete family", () => {
    const map = generateTacticalMap({
      seed: "qa813-temperate-town-small-0",
      params: {
        archetype: "settlement",
        biome: "temperate",
        settlement: "town",
        size: "small",
        hooks: DEFAULT_MISSION_HOOKS,
        slopeShare: 1,
      },
    });
    const sections = resolveMapModels(map).connectors.filter(
      (p) => p.ladder?.id === "ladder-1",
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]!.ladder).toMatchObject({
      finish: "weathered",
      supportModel: "building.wall",
    });
  });
});
