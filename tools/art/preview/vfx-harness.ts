/**
 * VFX harness: plays one combat sequence from the real
 * `TacticalAnimationQueue` against stand-in units, so effect sizes, anchors
 * and timing can be judged without playing a mission to contact.
 *
 * ```
 *   ?case=ranged|melee|death   which sequence
 *   ?px=64                     pixels per tile, the game's default zoom
 *   window.__vfx__.step(dt)    advance deterministically, then screenshot
 * ```
 *
 * Served by the dev server (`vite`), driven by `shoot-vfx.mjs`.
 */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  TextureLoader,
  WebGLRenderer,
} from "three";

import type { Texture } from "three";

import type { TacticalEvent } from "../../../src/tactical/model/tactical-event";
import { SPRITE_MANIFEST } from "../../../src/graphics/data/sprite-manifest";
import type { SpriteId } from "../../../src/graphics/data/sprite-manifest";
import type { SpriteSource } from "../../../src/graphics/model/sprite-source";
import type { AnimationScene } from "../../../src/graphics/service/tactical-animation-queue";
import { TacticalAnimationQueue } from "../../../src/graphics/service/tactical-animation-queue";

const params = new URLSearchParams(location.search);
const px = Number(params.get("px") ?? 64);
const which = params.get("case") ?? "ranged";
const size = 720;

/** Stand-in unit: a box the height of the real thing, in its faction's grey. */
function unit(x: number, height: number, colour: number): Object3D {
  const mesh = new Mesh(
    new BoxGeometry(0.6, height, 0.6),
    new MeshStandardMaterial({ color: colour }),
  );
  const holder = new Object3D();
  mesh.position.y = height / 2;
  holder.add(mesh);
  holder.position.set(x, 0, 0);
  return holder;
}

const HEIGHTS: Record<string, number> = {
  "unit-1": 2.79,
  "unit-2": which === "melee" ? 0.55 : 1.95,
};
const MODELS: Record<string, string> = {
  "unit-1": "tdf.mech.assembled-b",
  "unit-2": "bug.brute",
};

const scene = new Scene();
scene.background = new Color(0x2f3440);
const ground = new Mesh(
  new BoxGeometry(14, 0.1, 8),
  new MeshStandardMaterial({ color: 0x3a3d42 }),
);
ground.position.set(2, -0.05, 0);
scene.add(ground);

const objects = new Map<string, Object3D>();
objects.set("unit-1", unit(0, HEIGHTS["unit-1"]!, 0x5b6573));
objects.set(
  "unit-2",
  unit(which === "melee" ? 1 : 5, HEIGHTS["unit-2"]!, 0x2b2436),
);
for (const object of objects.values()) {
  scene.add(object);
}
scene.add(new AmbientLight(0xffffff, 0.55));
const key = new DirectionalLight(0xffffff, 2.9);
key.position.set(4, 8, 12);
scene.add(key);

const animationScene: AnimationScene = {
  unitObject: (id) => objects.get(id),
  tileWorldPosition: () => ({ x: 0, y: 0, z: 0 }),
  unitHeight: (id) => HEIGHTS[id],
  unitModelId: (id) => MODELS[id],
};

const loader = new TextureLoader();
const sprites: SpriteSource = {
  loadSprite: (id: SpriteId) =>
    new Promise<Texture | undefined>((resolve) => {
      loader.load(
        `/${SPRITE_MANIFEST[id].path}`,
        (texture) => resolve(texture),
        undefined,
        () => resolve(undefined),
      );
    }),
};

const units = size / px;
const camera = new OrthographicCamera(
  -units / 2,
  units / 2,
  units / 2,
  -units / 2,
  0.1,
  100,
);
const elevation = Math.atan(Math.SQRT1_2);
const target = { x: 2.4, y: 1.2, z: 0 };
camera.position.set(
  target.x + Math.sin(Math.PI / 4) * 20 * Math.cos(elevation),
  target.y + Math.sin(elevation) * 20,
  target.z + Math.cos(Math.PI / 4) * 20 * Math.cos(elevation),
);
camera.lookAt(target.x, target.y, target.z);

const queue = new TacticalAnimationQueue({
  scene: animationScene,
  sprites,
  camera,
});
const content = new Group();
content.add(queue.root);
scene.add(content);

const EVENTS: Record<string, TacticalEvent> = {
  ranged: {
    type: "tactical:attack-resolved",
    payload: {
      attackerId: "unit-1",
      targetId: "unit-2",
      hit: true,
      damage: 12,
      targetHp: 6,
    },
  },
  melee: {
    type: "tactical:attack-resolved",
    payload: {
      attackerId: "unit-2",
      targetId: "unit-1",
      hit: false,
      damage: 0,
      targetHp: 20,
    },
  },
  death: {
    type: "tactical:unit-died",
    payload: { unitId: "unit-2" },
  },
};

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(size, size);
document.body.appendChild(renderer.domElement);

/** Waits for every sprite to load, so a screenshot never catches an empty frame. */
async function ready(): Promise<void> {
  await Promise.all(
    (Object.keys(SPRITE_MANIFEST) as SpriteId[]).map((id) =>
      sprites.loadSprite(id),
    ),
  );
  queue.enqueue([EVENTS[which] ?? EVENTS.ranged!]);
  renderer.render(scene, camera);
  document.title = `READY ${which}`;
}

declare global {
  interface Window {
    /** Filmstrip driver: `shoot-vfx.mjs` steps the queue through this. */
    __vfx__?: {
      /**
       * Advances the queue by a fixed delta and redraws.
       * @param seconds - Delta to advance.
       */
      step(seconds: number): void;
    };
  }
}

window.__vfx__ = {
  /**
   * Advances the queue by a fixed delta and redraws, so a filmstrip frame is
   * reproducible where sampling a live mission is not.
   * @param seconds - Delta to advance.
   */
  step(seconds: number): void {
    queue.update(seconds);
    renderer.render(scene, camera);
  },
};

void ready();
