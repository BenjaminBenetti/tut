/**
 * Lineup of the Act III armoured variants beside their base species (#1179),
 * using the shipped GLBs, the model manifest and the production limb rig.
 *
 *   ┌─ card ───────────────────────────┐
 *   │  base ◄── one scene, one camera ──► variant │
 *   │  name · hp · armour · triangles  │
 *   └──────────────────────────────────┘
 *
 * Both models of a pair share a scene and an orthographic camera, so the
 * card shows their relative size as the tactical camera would.
 */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BUG_SPECIES } from "../../../src/bugs/data/species";
import type { BugSpeciesId } from "../../../src/content/model/bug-species-id";
import type { ModelAssetId } from "../../../src/content/data/model-ids";
import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import { UnitMotionRig } from "../../../src/graphics/service/unit-motion-rig";

// ===========================================
// Types
// ===========================================

/** A built model's size, as tools/art/build-placeholders.mjs records it. */
interface BuildRecord {
  readonly id: string;
  readonly triangles: number;
  readonly bytes: number;
}

/** One model of a pair: where it stands and the rig that poses it. */
interface Figure {
  readonly holder: Group;
  readonly rig: UnitMotionRig;
  /** Half the model's widest horizontal extent, legs and blades included. */
  readonly reach: number;
}

/** One card: a base species and its variant in one scene. */
interface Pair {
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  readonly renderer: WebGLRenderer;
  readonly viewport: HTMLElement;
  readonly figures: readonly [Figure, Figure];
  readonly height: number;
}

// ===========================================
// Constants
// ===========================================

/** The isometric camera's elevation, as the tactical camera uses it. */
const ELEVATION = Math.atan(1 / Math.sqrt(2));
/** Clear ground between the two models of a pair, in tiles. */
const GAP = 0.35;

// ===========================================
// Setup
// ===========================================

const records = (await (
  await fetch("/tools/art/placeholders.manifest.json")
).json()) as BuildRecord[];
const loader = new GLTFLoader();
const pose = document.querySelector<HTMLSelectElement>("#pose")!;
const angle = document.querySelector<HTMLInputElement>("#angle")!;
let elapsed = 0;
let frozen = false;

/**
 * Loads a species' model through the manifest and rigs it as the
 * battlefield does, turned to face the camera's side of the scene.
 */
async function figure(species: BugSpeciesId): Promise<Figure> {
  const id: ModelAssetId = BUG_SPECIES[species].modelId;
  const model = (await loader.loadAsync(`/${MODEL_MANIFEST[id].path}`)).scene;
  const rig = new UnitMotionRig(model, id);
  model.rotateY(Math.PI);
  model.traverse((part) => {
    if (part instanceof Mesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  const holder = new Group();
  holder.add(model);
  // Stand the model on its own ground centre, so the pair spaces evenly.
  const bounds = new Box3().setFromObject(holder);
  const centre = bounds.getCenter(new Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  const size = bounds.getSize(new Vector3());
  return { holder, rig, reach: Math.hypot(size.x, size.z) / 2 };
}

/** One species' caption: its name, its stat line and its build size. */
function caption(species: BugSpeciesId): string {
  const block = BUG_SPECIES[species];
  const record = records.find((r) => r.id === block.modelId);
  const size = record
    ? `${record.triangles.toLocaleString("en")} tris · ${(record.bytes / 1024).toFixed(0)} KiB`
    : "";
  return `<div><div class="eyebrow">${block.modelId}</div><h2>${block.name}</h2><div class="stats">HP ${block.hp} · armour ${block.armor} · move ${block.move}<br />${size}</div></div>`;
}

/** Builds one card's scene, lights, floor and camera around its two models. */
async function pair(card: HTMLElement): Promise<Pair> {
  const base = card.dataset.base as BugSpeciesId;
  const variant = card.dataset.variant as BugSpeciesId;
  const figures = [await figure(base), await figure(variant)] as const;
  const scene = new Scene();
  scene.background = new Color(0x25231f);
  const floor = new Mesh(
    new PlaneGeometry(200, 200),
    new MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.006;
  floor.receiveShadow = true;
  scene.add(floor, new AmbientLight(0xffffff, 0.55));
  const key = new DirectionalLight(0xffffff, 2.9);
  key.position.set(4, 8, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -4,
    right: 4,
    top: 4,
    bottom: -4,
    near: 0.5,
    far: 30,
  });
  key.shadow.bias = -0.0015;
  key.shadow.normalBias = 0.02;
  scene.add(key, ...figures.map((f) => f.holder));
  const height = Math.max(
    ...figures.map(
      (f) => new Box3().setFromObject(f.holder).getSize(new Vector3()).y,
    ),
  );
  const renderer = new WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const viewport = card.querySelector<HTMLElement>(".viewport")!;
  viewport.append(renderer.domElement);
  card.querySelector(".caption")!.innerHTML = caption(base) + caption(variant);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  return { scene, camera, renderer, viewport, figures, height };
}

const pairs = await Promise.all(
  [...document.querySelectorAll<HTMLElement>("article")].map(pair),
);

// ===========================================
// Framing
// ===========================================

/**
 * Stands the pair side by side across the view at `degrees` of yaw and
 * frames both at one scale: base on the left, variant on the right.
 */
function frame(degrees: number): void {
  const yaw = (degrees * Math.PI) / 180;
  const across = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  for (const pair of pairs) {
    const [left, right] = pair.figures;
    const reach = Math.max(left.reach, right.reach);
    const offset = reach * 0.85 + GAP / 2;
    left.holder.position.copy(across).multiplyScalar(-offset);
    right.holder.position.copy(across).multiplyScalar(offset);
    const width = pair.viewport.clientWidth;
    const height = pair.viewport.clientHeight;
    const span = Math.max(
      pair.height * 1.7,
      ((offset + reach) * 2 * 1.06 * height) / width,
    );
    pair.camera.left = (-span * width) / height / 2;
    pair.camera.right = -pair.camera.left;
    pair.camera.top = span / 2;
    pair.camera.bottom = -span / 2;
    pair.camera.updateProjectionMatrix();
    const centre = new Vector3(0, pair.height * 0.42, 0);
    pair.camera.position
      .copy(centre)
      .add(
        new Vector3(
          Math.sin(yaw) * Math.cos(ELEVATION),
          Math.sin(ELEVATION),
          Math.cos(yaw) * Math.cos(ELEVATION),
        ).multiplyScalar(12),
      );
    pair.camera.lookAt(centre);
    pair.renderer.setSize(width, height, false);
  }
}

/** Poses every model with the production rig and draws each card. */
function render(): void {
  for (const pair of pairs) {
    for (const { rig } of pair.figures) {
      if (pose.value === "walk") rig.walk(elapsed * 1.3);
      else if (pose.value === "strike") rig.attack((elapsed * 0.8) % 1, true);
      else rig.reset();
    }
    pair.renderer.render(pair.scene, pair.camera);
  }
}

angle.oninput = () => frame(Number(angle.value));
pose.onchange = () => {
  elapsed = 0;
};
window.addEventListener("resize", () => frame(Number(angle.value)));
frame(45);
render();
document.querySelector("#status")!.textContent =
  `Ready · ${pairs.length * 2} models`;

let last = performance.now();
/** One frame loop for the three cards, capped against background-tab jumps. */
function animate(now: number): void {
  if (!frozen) elapsed += Math.min((now - last) / 1000, 0.05);
  last = now;
  render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

Object.assign(window, {
  __armoured: {
    /** Freezes a pose at `seconds` and a yaw, for repeatable captures. */
    capture(action: string, seconds: number, degrees = 45): void {
      frozen = true;
      pose.value = action;
      elapsed = seconds;
      angle.value = String(degrees);
      frame(degrees);
      render();
    },
  },
});
