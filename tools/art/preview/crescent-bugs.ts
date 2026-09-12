/** Interactive review of the exported Crescent kit, using the production rigid animation. */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
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
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import type { ModelAssetId } from "../../../src/content/data/model-ids";
import { UnitMotionRig } from "../../../src/graphics/service/unit-motion-rig";

interface BuildRecord {
  id: string;
  triangles: number;
  bytes: number;
}
const records = (await (
  await fetch("/tools/art/placeholders.manifest.json")
).json()) as BuildRecord[];
const loader = new GLTFLoader();
const pose = document.querySelector<HTMLSelectElement>("#pose")!;
const ground = document.querySelector<HTMLSelectElement>("#ground")!;
const framing = document.querySelector<HTMLSelectElement>("#framing")!;
const angle = document.querySelector<HTMLInputElement>("#angle")!;
const turn = document.querySelector<HTMLButtonElement>("#turn")!;
let turning = false;
let elapsed = 0;
let frozen = false;

const actors = await Promise.all(
  [...document.querySelectorAll<HTMLElement>("article")].map(async (card) => {
    const id = card.dataset.model as ModelAssetId;
    const entry = MODEL_MANIFEST[id];
    const model = (await loader.loadAsync(`/${entry.path}`)).scene;
    const scene = new Scene();
    scene.background = new Color(0x25231f);
    const rig =
      id === "bug.egg-spawner" ? undefined : new UnitMotionRig(model, id);
    if (rig) model.rotateY(Math.PI);
    scene.add(model);
    const bounds = new Box3().setFromObject(model);
    const centre = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const extent = Math.max(size.y, Math.hypot(size.x, size.z)) * 1.32;
    model.traverse((part) => {
      if (part instanceof Mesh) {
        part.castShadow = true;
        part.receiveShadow = true;
      }
    });
    const floor = new Mesh(
      new PlaneGeometry(200, 200),
      new MeshStandardMaterial({ color: ground.value, roughness: 0.95 }),
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
      left: -3,
      right: 3,
      top: 3,
      bottom: -3,
      near: 0.5,
      far: 30,
    });
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const renderer = new WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    const viewport = card.querySelector<HTMLElement>(".viewport")!;
    viewport.append(renderer.domElement);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(centre);
    controls.enablePan = false;
    controls.minZoom = 0.5;
    controls.maxZoom = 3;
    controls.maxPolarAngle = Math.PI * 0.49;
    const record = records.find((record) => record.id === id)!;
    card.querySelector(".stats")!.textContent =
      `${entry.height.toFixed(1)} u high · ${record.triangles.toLocaleString("en")} triangles · ${(record.bytes / 1024).toFixed(0)} KiB`;
    return {
      id,
      scene,
      rig,
      floor,
      renderer,
      viewport,
      camera,
      controls,
      centre,
      extent,
    };
  }),
);

/** Fits every preview while keeping tactical framing at exactly 64 CSS pixels per world unit. */
function resize(): void {
  for (const actor of actors) {
    const { viewport, renderer, camera, extent } = actor;
    const width = viewport.clientWidth,
      height = viewport.clientHeight;
    const span =
      framing.value === "tactical"
        ? height / 64
        : framing.value === "scale"
          ? 2.6
          : extent * (pose.value === "rest" ? 1 : 1.25);
    camera.left = (-span * width) / height / 2;
    camera.right = -camera.left;
    camera.top = span / 2;
    camera.bottom = -camera.top;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
}

/** Restores a shared isometric yaw without changing the chosen framing. */
function setAngle(degrees: number): void {
  const yaw = (degrees * Math.PI) / 180;
  const elevation = Math.atan(1 / Math.sqrt(2));
  for (const actor of actors) {
    actor.camera.position
      .copy(actor.centre)
      .add(
        new Vector3(
          Math.sin(yaw) * Math.cos(elevation),
          Math.sin(elevation),
          Math.cos(yaw) * Math.cos(elevation),
        ).multiplyScalar(10),
      );
    actor.controls.update();
  }
}

/** Samples the real limb rig; the rooted spawner deliberately has no walking pose. */
function render(): void {
  for (const actor of actors) {
    if (pose.value === "walk") actor.rig?.walk(elapsed * 1.3);
    else if (pose.value === "strike")
      actor.rig?.attack((elapsed * 0.8) % 1, true);
    else actor.rig?.reset();
    actor.controls.update();
    actor.renderer.render(actor.scene, actor.camera);
  }
}

framing.onchange = resize;
window.addEventListener("resize", resize);
angle.oninput = () => setAngle(Number(angle.value));
pose.onchange = () => {
  elapsed = 0;
  resize();
};
ground.onchange = () => {
  for (const actor of actors) actor.floor.material.color.set(ground.value);
};
turn.onclick = () => {
  turning = !turning;
  turn.setAttribute("aria-pressed", String(turning));
};
resize();
setAngle(45);
render();
document.querySelector("#status")!.textContent = "Ready · 4 models";
let last = performance.now();

/** One frame loop serves the four views and caps background-tab time jumps. */
function animate(now: number): void {
  if (!frozen) {
    const delta = Math.min((now - last) / 1000, 0.05);
    elapsed += delta;
    if (turning) {
      angle.value = String((Number(angle.value) + delta * 24) % 360);
      setAngle(Number(angle.value));
    }
  }
  last = now;
  render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
Object.assign(window, {
  __crescent: {
    /** Freezes a precise production-rig pose for repeatable review captures. */
    capture(action: string, seconds: number): void {
      frozen = true;
      turning = false;
      pose.value = action;
      elapsed = seconds;
      resize();
      render();
    },
  },
});
