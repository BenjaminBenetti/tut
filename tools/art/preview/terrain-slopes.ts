import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";

import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import {
  LEVEL_HEIGHT,
  SLAB_HEIGHT,
  SURFACE_COLOURS,
} from "../../../src/graphics/data/mapgen-preview-palette";
import {
  SLOPE_MODELS,
  surfaceModel,
} from "../../../src/graphics/data/map-model-table";
import { GltfModelLoader } from "../../../src/graphics/service/gltf-model-loader";
import { PlaceholderModelFactory } from "../../../src/graphics/service/placeholder-model-factory";
import { OrthographicCameraRig } from "../../../src/graphics/service/orthographic-camera-rig";
import { SceneService } from "../../../src/graphics/service/scene-service";
import { TerrainSlopeModelFactory } from "../../../src/graphics/service/terrain-slope-model-factory";

const models = new GltfModelLoader({
  manifest: MODEL_MANIFEST,
  baseUrl: "/",
  fallback: new PlaceholderModelFactory(),
  logger: console,
});
const slopes = new TerrainSlopeModelFactory(models);
const content = new Group();

/** Four corner heights in glTF X/Z order: SW, SE, NE, NW. */
const PATTERNS = {
  straight: [0, 0, 1, 1],
  inner: [0, 1, 1, 1],
  outer: [0, 0, 1, 0],
} as const;

/** L-shaped terrace with both concave and convex turns. */
function high(x: number, z: number): number {
  return z >= 4 || (x >= 1 && x <= 2 && z >= 2) ? 1 : 0;
}

/** Builds the same abutting grid twice, borrowing each ground model's top material/UV cell. */
async function terrace(
  surface: "grass" | "sand",
  offset: number,
): Promise<void> {
  const ground = await models.load(surfaceModel(surface)!);
  let top: Mesh | undefined;
  ground.traverse((node) => {
    if (node instanceof Mesh) top = node;
  });
  if (!top || Array.isArray(top.material))
    throw new Error("Expected a single-material ground slab");
  const uv = top.geometry.getAttribute("uv");
  const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
  const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
  const materials = {
    surface: top.material,
    sides: new MeshStandardMaterial({ color: SURFACE_COLOURS[surface] }),
    uv: {
      u0: Math.min(...us),
      v0: Math.min(...vs),
      u1: Math.max(...us),
      v1: Math.max(...vs),
    },
  };
  const prototypes = new Map<keyof typeof SLOPE_MODELS, Group>();
  for (const kind of Object.keys(
    SLOPE_MODELS,
  ) as (keyof typeof SLOPE_MODELS)[]) {
    prototypes.set(kind, await slopes.create(kind, materials));
  }
  for (let z = 0; z < 5; z++)
    for (let x = 0; x < 5; x++) {
      const heights = [
        high(x, z),
        high(x + 1, z),
        high(x + 1, z + 1),
        high(x, z + 1),
      ];
      const flat = heights.every((height) => height === heights[0]);
      const level = flat ? heights[0]! : 0;
      const height = SLAB_HEIGHT + LEVEL_HEIGHT * level;
      // Butt the slab onto its pillar; coincident top faces would z-fight.
      const pillarHeight = flat ? height - 0.05 : height;
      const pillar = new Mesh(
        new BoxGeometry(1, pillarHeight, 1),
        materials.sides,
      );
      pillar.position.set(offset + x + 0.5, pillarHeight / 2, z + 0.5);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      content.add(pillar);
      if (flat) {
        const slab = ground.clone(true);
        slab.position.set(offset + x + 0.5, height - 0.025, z + 0.5);
        slab.traverse((node) => {
          if (node instanceof Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        content.add(slab);
        continue;
      }
      let placed = false;
      for (const kind of Object.keys(PATTERNS) as (keyof typeof PATTERNS)[]) {
        for (let turn = 0; turn < 4; turn++) {
          if (
            !heights.every(
              (value, i) => value === PATTERNS[kind][(i + turn) % 4],
            )
          )
            continue;
          const slope = prototypes.get(kind)!.clone(true);
          slope.position.set(offset + x + 0.5, SLAB_HEIGHT, z + 0.5);
          slope.rotation.y = (turn * Math.PI) / 2;
          content.add(slope);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) throw new Error(`Unmatched terrace corner ${x},${z}`);
    }
}

/** Mounts the actual GLBs and game lighting for the composite acceptance frame. */
async function main(): Promise<void> {
  await terrace("grass", -5.5);
  await terrace("sand", 0.5);
  const rig = new OrthographicCameraRig({ zoom: 90, yawIndex: 2 });
  rig.lookAt({ x: 0, y: 0.5, z: 2.5 });
  const scene = new SceneService(document.getElementById("viewport")!, {
    camera: rig,
    content,
  });
  scene.start();
  await scene.whenFirstFrameRendered();
  document.body.dataset.slopesReady = "true";
}

void main();
