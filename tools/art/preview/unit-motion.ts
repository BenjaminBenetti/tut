/** Real-model preview of the production movement / combat queue, with deterministic stepping. */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  TextureLoader,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import { SPRITE_MANIFEST } from "../../../src/graphics/data/sprite-manifest";
import { TacticalAnimationQueue } from "../../../src/graphics/service/tactical-animation-queue";
import { UnitMesh } from "../../../src/graphics/view/unit-mesh";
import { tileTopCentre } from "../../../src/graphics/view/tactical-map-view";

const ids = [
  "tdf.infantry.rifle",
  "tdf.infantry.rocket",
  "tdf.infantry.sniper",
  "tdf.infantry.engineer",
  "tdf.infantry.medic",
  "tdf.mech.assembled-a",
  "tdf.mech.assembled-b",
  "bug.swarmer",
  "bug.lurker",
  "bug.brute",
] as const;
const select = document.querySelector<HTMLSelectElement>("#model")!;
for (const id of ids) select.add(new Option(id, id));
const scene = new Scene();
scene.background = new Color(0x202633);
scene.add(new AmbientLight(0xffffff, 2));
const light = new DirectionalLight(0xffffff, 3);
light.position.set(3, 8, 4);
scene.add(light);
const ground = new Mesh(
  new BoxGeometry(12, 0.05, 8),
  new MeshStandardMaterial({ color: 0x424a50 }),
);
scene.add(ground);
const camera = new OrthographicCamera(-4.5, 4.5, 3.375, -3.375, 0.1, 100);
camera.position.set(8, 7, 10);
camera.lookAt(0, 0.9, 0);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(960, 720);
document.body.append(renderer.domElement);
const loader = new GLTFLoader();
const prototypes = await Promise.all(
  ids.map(
    async (id) => (await loader.loadAsync(`/${MODEL_MANIFEST[id].path}`)).scene,
  ),
);
const textureLoader = new TextureLoader();
const textures = new Map(
  await Promise.all(
    Object.entries(SPRITE_MANIFEST).map(
      async ([id, entry]) =>
        [id, await textureLoader.loadAsync(`/${entry.path}`)] as const,
    ),
  ),
);
let actor: UnitMesh;
const target = new UnitMesh("target", prototypes[9]!.clone(true), "bug.brute");
target.setPose({ x: 2, y: 0, z: 0 }, "w");
scene.add(target.object);
let queue: TacticalAnimationQueue;
let paused = false;

/** Resets the actor and queue to a repeatable starting point. */
function reset(): void {
  queue?.dispose();
  actor?.dispose();
  const index = Math.max(
    0,
    ids.findIndex((id) => id === select.value),
  );
  const id = ids[index]!;
  actor = new UnitMesh("actor", prototypes[index]!.clone(true), id);
  actor.setPose({ x: -2, y: 0, z: 0 }, "s");
  actor.setHighlight({ hovered: false, selected: true });
  scene.add(actor.object);
  queue = new TacticalAnimationQueue({
    camera,
    sprites: { loadSprite: (id) => Promise.resolve(textures.get(id)) },
    scene: {
      unitObject: (id) => (id === "actor" ? actor.object : target.object),
      unitMotion: (id) => (id === "actor" ? actor.motion : target.motion),
      unitHeight: (unit) =>
        MODEL_MANIFEST[unit === "actor" ? id : "bug.brute"].height,
      unitModelId: (unit) => (unit === "actor" ? id : "bug.brute"),
      tileWorldPosition: tileTopCentre,
      spawnerWorldPosition: () => undefined,
      spawnerHeight: () => undefined,
    },
  });
  scene.add(queue.root);
  renderer.render(scene, camera);
}

/** Plays the real tactical event while keeping controls and captures deterministic. */
function play(action: "walk" | "attack"): void {
  reset();
  if (action === "walk") {
    queue.enqueue([
      {
        type: "tactical:unit-moved",
        payload: {
          unitId: "actor",
          from: { x: -2, y: 0, z: 0 },
          to: { x: 1, y: 0, z: 0 },
          path: [
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
          ],
        },
      },
    ]);
  } else {
    if (select.value.startsWith("bug."))
      actor.setPose({ x: 1, y: 0, z: 0 }, "s");
    queue.enqueue([
      {
        type: "tactical:attack-resolved",
        payload: {
          attackerId: "actor",
          targetId: "target",
          hit: true,
          damage: 7,
          targetHp: 10,
          weaponRange: select.value.startsWith("bug.") ? 1 : 8,
        },
      },
    ]);
  }
}
select.onchange = reset;
document.querySelector<HTMLButtonElement>("#walk")!.onclick = () =>
  play("walk");
document.querySelector<HTMLButtonElement>("#attack")!.onclick = () =>
  play("attack");
document.querySelector<HTMLButtonElement>("#reset")!.onclick = reset;
document.querySelector<HTMLButtonElement>("#pause")!.onclick = () => {
  paused = !paused;
};
reset();
document.querySelector("#status")!.textContent = "Ready";
let last = performance.now();
renderer.setAnimationLoop((now) => {
  if (!paused) queue.update(Math.min(0.05, (now - last) / 1000));
  last = now;
  renderer.render(scene, camera);
});
Object.assign(window, {
  __unitMotion: {
    /** Selects a model and pauses playback for capture. */
    select(id: string): void {
      select.value = id;
      paused = true;
      reset();
    },
    play,
    /** Advances precisely one sample before a screenshot. */
    step(seconds: number): void {
      queue.update(seconds);
      renderer.render(scene, camera);
    },
  },
});
