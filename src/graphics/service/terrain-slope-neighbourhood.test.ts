/// <reference types="node" />
import { readFileSync } from "node:fs";
import {
  BoxGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { DEFAULT_MISSION_HOOKS } from "../../mapgen/data/hook-requirements";
import type { Rotation } from "../../mapgen/model/prop";
import type { Tile } from "../../mapgen/model/tile";
import type { ModelAssetId } from "../../content/data/model-ids";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { TacticalMapView } from "../view/tactical-map-view";
import { resolveMapModels } from "./map-model-resolver";

/** West/south corner and its two flanking straights, rotated together. */
function neighbourhood(kind: "inner" | "outer", turns: Rotation, rise: number) {
  const base = new FixtureMapBuilder(3, 3, 3).fillGround().build();
  const tiles: Tile[] = base.tiles.map((tile) => {
    const dx = tile.x - 1,
      dz = tile.z - 1;
    const high = kind === "inner" ? dx < 0 || dz > 0 : dx < 0 && dz > 0;
    let slope: Tile["slope"];
    if (dx === 0 && dz === 0) slope = { kind, turns: 0 };
    if (kind === "inner") {
      if (dx === 0 && dz === -1) slope = { kind: "straight", turns: 1 };
      if (dx === 1 && dz === 0) slope = { kind: "straight", turns: 0 };
    } else {
      if (dx === -1 && dz === 0) slope = { kind: "straight", turns: 0 };
      if (dx === 0 && dz === 1) slope = { kind: "straight", turns: 1 };
    }
    let x = dx,
      z = dz;
    for (let i = 0; i < turns; i++) [x, z] = [-z, x];
    return {
      ...tile,
      x: x + 1,
      z: z + 1,
      y: high ? rise : 0,
      slope: slope
        ? { ...slope, turns: ((slope.turns + turns) % 4) as Rotation }
        : undefined,
    };
  });
  return { ...base, tiles };
}

/** Shipped slope GLBs; exact-size ground slab without a texture dependency. */
function loader() {
  const cache = new Map<ModelAssetId, Promise<Object3D>>();
  const load = async (id: ModelAssetId): Promise<Object3D> => {
    if (!cache.has(id))
      cache.set(
        id,
        (async () => {
          if (!id.startsWith("tile.slope."))
            return new Mesh(
              new BoxGeometry(1, 0.05, 1),
              new MeshStandardMaterial(),
            );
          const bytes = readFileSync(
            new URL(
              `../../../public/${MODEL_MANIFEST[id].path}`,
              import.meta.url,
            ),
          );
          return (
            await new GLTFLoader().parseAsync(
              bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
              ),
              "",
            )
          ).scene;
        })(),
      );
    return (await cache.get(id)!).clone(true);
  };
  return {
    load,
    preload: async (ids: readonly ModelAssetId[]) => {
      await Promise.all(ids.map(load));
    },
  };
}

describe("terrain slope neighbourhoods (#809, #817)", () => {
  it("places every hills-1 half step with the unscaled kit after #808", () => {
    const map = generateTacticalMap({
      seed: "hills-1",
      params: {
        archetype: "settlement",
        biome: "snowy",
        settlement: "rural",
        size: "medium",
        hooks: DEFAULT_MISSION_HOOKS,
        slopeShare: 1,
      },
    });
    const tiles = map.tiles.filter((tile) => tile.slope !== undefined);
    // #849 adds fitted art on previously unmarked tiles; this assertion
    // continues to cover every original Tile.slope and its one-layer scale.
    const models = resolveMapModels(map).tiles.filter(
      (placement) =>
        placement.modelId.startsWith("tile.slope.") && !placement.terrain,
    );
    expect(tiles.length).toBeGreaterThan(0);
    expect(models).toHaveLength(tiles.length);
    expect(new Set(models.map((placement) => placement.scaleY))).toEqual(
      new Set([1]),
    );
    expect(new Set(models.map((placement) => placement.modelId))).toEqual(
      new Set(["tile.slope.straight", "tile.slope.inner", "tile.slope.outer"]),
    );
  });

  for (const rise of [1, 2])
    for (const kind of ["inner", "outer"] as const)
      for (const turns of [0, 1, 2, 3] as const) {
        it(`${kind} turn ${turns}, rise ${rise}: both flanking slopes and both flat neighbours meet every shared edge`, async () => {
          const view = new TacticalMapView(neighbourhood(kind, turns, rise));
          await view.loadModels(loader());
          view.root.updateMatrixWorld(true);
          const meshes: InstancedMesh[] = [];
          view.root.traverse((object) => {
            if (
              object instanceof InstancedMesh &&
              object.name.startsWith("tiles-model:")
            )
              meshes.push(object as InstancedMesh);
          });
          const height = (x: number, z: number) => {
            const hits = new Raycaster(
              new Vector3(x, 5, z),
              new Vector3(0, -1, 0),
            ).intersectObjects(meshes);
            expect(hits.length, `missing top at ${x},${z}`).toBeGreaterThan(0);
            return hits[0]!.point.y;
          };
          const e = 0.00001;
          for (const t of [0.01, 0.25, 0.5, 0.75, 0.99]) {
            expect(height(1 - e, 1 + t)).toBeCloseTo(height(1 + e, 1 + t), 3);
            expect(height(2 - e, 1 + t)).toBeCloseTo(height(2 + e, 1 + t), 3);
            expect(height(1 + t, 1 - e)).toBeCloseTo(height(1 + t, 1 + e), 3);
            expect(height(1 + t, 2 - e)).toBeCloseTo(height(1 + t, 2 + e), 3);
          }
          view.dispose();
        });
      }
});
