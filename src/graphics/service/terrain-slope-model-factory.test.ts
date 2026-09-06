/// <reference types="node" />
import { readFileSync } from "node:fs";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { MODEL_MANIFEST } from "../data/model-manifest";
import { SLOPE_MODELS } from "../data/map-model-table";
import { LAYER_HEIGHT } from "../data/mapgen-preview-palette";
import {
  TerrainSlopeModelFactory,
  slopeMaterialsFromGround,
} from "./terrain-slope-model-factory";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { tileTop } from "../view/tactical-map-view";
import { resolveMapModels } from "./map-model-resolver";

/** Parses the real, texture-neutral GLB, so tests exercise the exported art contract. */
async function prototype(kind: keyof typeof SLOPE_MODELS): Promise<Object3D> {
  const file = new URL(
    `../../../public/${MODEL_MANIFEST[SLOPE_MODELS[kind]].path}`,
    import.meta.url,
  );
  const bytes = readFileSync(file);
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return (await new GLTFLoader().parseAsync(data, "")).scene;
}

/** One layer, matching the single Blender RISE parameter. */
const SLOPE_RISE = LAYER_HEIGHT;

describe("terrain slope kit", () => {
  for (const kind of Object.keys(
    SLOPE_MODELS,
  ) as (keyof typeof SLOPE_MODELS)[]) {
    it(`${kind} covers one whole tile, joins at the current one-layer rise, and borrows both ground materials`, async () => {
      const source = await prototype(kind);
      const loader = {
        load: () => Promise.resolve(source.clone(true)),
        preload: () => Promise.resolve(),
      };
      const surface = new MeshStandardMaterial({ color: 0x5e7a3a });
      const sides = new MeshStandardMaterial({ color: 0x5e7a3a });
      const factory = new TerrainSlopeModelFactory(loader);
      const node = await factory.create(kind, {
        surface,
        sides,
        uv: { u0: 0.25, v0: 0.5, u1: 0.5, v1: 0.75 },
      });
      node.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(node);
      expect(bounds.min.toArray()).toEqual([-0.5, 0, -0.5]);
      expect(bounds.max.toArray()).toEqual([0.5, SLOPE_RISE, 0.5]);
      expect(MODEL_MANIFEST[SLOPE_MODELS[kind]].height).toBe(SLOPE_RISE);
      const top = node.getObjectByName("slope-surface") as Mesh;
      const side = node.getObjectByName("slope-sides") as Mesh;
      expect(top.material).toBe(surface);
      expect(side.material).toBe(sides);
      expect(top.geometry.getAttribute("position").count).toBe(6);
      const uv = top.geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThanOrEqual(0.25);
        expect(uv.getX(i)).toBeLessThanOrEqual(0.5);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(0.5);
        expect(uv.getY(i)).toBeLessThanOrEqual(0.75);
      }
      // Sample the full top, including the corner diagonal: no missing triangles
      // or wrong-facing normals. These are the documented height fields #799 maps.
      for (const x of [-0.49, 0, 0.49])
        for (const z of [-0.49, 0, 0.49]) {
          const ray = new Raycaster(
            new Vector3(x, SLOPE_RISE + 1, z),
            new Vector3(0, -1, 0),
          );
          const hit = ray.intersectObject(top)[0];
          const fraction =
            kind === "straight"
              ? z + 0.5
              : kind === "inner"
                ? Math.max(x + 0.5, z + 0.5)
                : Math.min(x + 0.5, z + 0.5);
          expect(hit, `${kind} at ${x},${z}`).toBeDefined();
          expect(hit!.point.y).toBeCloseTo(fraction * SLOPE_RISE);
        }
      // Exercise the actual asset with #799's map-data convention through the
      // resolver: corners start high to the west/south, unlike the asset's east/south.
      const field = new FixtureMapBuilder(1, 1, 2).fillGround().build();
      for (const turns of [0, 1, 2, 3] as const) {
        const map = {
          ...field,
          tiles: field.tiles.map((tile) => ({
            ...tile,
            slope: { kind, turns },
          })),
        };
        // Interim (ADR 0008 §3 child b): the resolver places no slope model
        // until #809 re-emits the kit at one layer of rise, so the
        // placement is built here the way the resolver did in #811 —
        // corner assets add a quarter turn to reconcile their east/south
        // high corner with map data's west/south. #809 restores the
        // resolver call.
        expect(
          resolveMapModels(map).tiles.some((p) =>
            p.modelId.startsWith("tile.slope."),
          ),
        ).toBe(false);
        const tile = map.tiles[0]!;
        const placement = {
          modelId: SLOPE_MODELS[kind],
          position: { x: tile.x + 0.5, y: tileTop(tile.y), z: tile.z + 0.5 },
          turns: ((turns + (kind === "straight" ? 0 : 1)) % 4) as 0 | 1 | 2 | 3,
        };
        node.position.copy(placement.position);
        node.rotation.y = (-placement.turns * Math.PI) / 2;
        node.updateMatrixWorld(true);
        for (const x of [-0.49, 0.49])
          for (const z of [-0.49, 0.49]) {
            const local = new Vector3(x, 0, z).applyAxisAngle(
              new Vector3(0, 1, 0),
              (turns * Math.PI) / 2,
            );
            const fraction =
              kind === "straight"
                ? local.z + 0.5
                : kind === "inner"
                  ? Math.max(0.5 - local.x, local.z + 0.5)
                  : Math.min(0.5 - local.x, local.z + 0.5);
            const hit = new Raycaster(
              new Vector3(x + 0.5, SLOPE_RISE + 1, z + 0.5),
              new Vector3(0, -1, 0),
            ).intersectObject(top)[0];
            expect(hit, `${kind} turn ${turns} at ${x},${z}`).toBeDefined();
            expect(hit!.point.y).toBeCloseTo(
              placement.position.y + fraction * SLOPE_RISE,
            );
          }
      }
      // An independent material choice reuses the asset, never recolours its source.
      const sand = new MeshStandardMaterial({ color: 0xd9b87a });
      const other = await factory.create(kind, { surface: sand, sides: sand });
      expect((other.getObjectByName("slope-surface") as Mesh).material).toBe(
        sand,
      );
      expect(top.material).toBe(surface);
      source.traverse((part) => {
        if (part instanceof Mesh) {
          const mesh = part as Mesh;
          expect(mesh.material).not.toBe(surface);
          expect(mesh.material).not.toBe(sand);
          expect(mesh.geometry.getAttribute("uv").getX(0)).toBeLessThanOrEqual(
            1,
          );
        }
      });
      for (const root of [node, other, source])
        root.traverse((part) => {
          if (part instanceof Mesh) (part as Mesh).geometry.dispose();
        });
      surface.dispose();
      sides.dispose();
      sand.dispose();
    });
  }

  it("borrows the slab's atlas cell, excluding a smaller detail's material", () => {
    const ground = new Group();
    const surface = new MeshStandardMaterial();
    const sides = new MeshStandardMaterial();
    const detailMaterial = new MeshStandardMaterial();
    const slab = new Mesh(new BoxGeometry(1, 0.05, 1), surface);
    const uv = slab.geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, 0.25 + uv.getX(i) * 0.25, 0.5 + uv.getY(i) * 0.25);
    const detail = new Mesh(new BoxGeometry(0.1, 0.1, 0.3), detailMaterial);
    ground.add(slab, detail);
    expect(slopeMaterialsFromGround(ground, sides)).toEqual({
      surface,
      sides,
      uv: { u0: 0.25, v0: 0.5, u1: 0.5, v1: 0.75 },
    });
    expect(slopeMaterialsFromGround(new Group(), sides)).toEqual({
      surface: sides,
      sides,
    });
    slab.geometry.dispose();
    detail.geometry.dispose();
    surface.dispose();
    sides.dispose();
    detailMaterial.dispose();
  });
});
