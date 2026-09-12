import type { Camera } from "three";
import { DirectionalLight, OrthographicCamera, Vector3 } from "three";

// ===========================================
// Tuning
// ===========================================

/**
 * The shadow rig, from the Art Director's prototype on #507. The numbers
 * are an art call, not an implementation detail: the ambient drop is half
 * the effect, because at 0.8 the fill washes cast shadows into grey
 * smudges. At 0.55 they read while unlit faces stay legible, which is the
 * constraint style guide §12.1 set.
 */
export const SHADOW_TUNING = {
  /** Key light strength, raised to pay for the lower fill. */
  keyIntensity: 2.9,
  /** Fill strength. Lower than it was, deliberately — see above. */
  ambientIntensity: 0.55,
  /**
   * Shadow map edge in texels. 1024 rather than the 2048 the prototype
   * used: at this zoom the Art Director judged 1024 to read the same,
   * and 2048 PCF-soft cost too much where the renderer is software.
   * Headless Chromium runs on SwiftShader, and 2048 took the e2e suite
   * from ~30 s to 1.5 minutes and timed two specs out (#507).
   */
  mapSize: 1024,
  /**
   * Half-width of the orthographic shadow frustum, in tiles, at rest.
   * `followCamera` widens it to cover the ground the view can see, up
   * to `maxExtent`; 30 is the floor a close zoom keeps for sharpness.
   */
  extent: 30,
  /**
   * The widest the frustum grows. Beyond this a 1024 map is too coarse
   * to be worth the pass, and a view that wide is a map view anyway.
   */
  maxExtent: 140,
  /** Ground margin past the visible area, so a caster just off screen still shadows into it. */
  extentMargin: 6,
  near: 0.5,
  /** Past the far corner of the widest frustum from a light 224 tiles out. */
  far: 500,
  /** Pulls the depth test off surfaces, against acne on flat ground. */
  bias: -0.0015,
  /** Offsets along the normal, against acne on the slabs' thin edges. */
  normalBias: 0.02,
} as const;

/** Where the key light sits relative to whatever it is lighting. */
/**
 * Where the key light sits relative to what it lights. The direction is
 * what the art was lit under; the *distance* is the fix the Executive
 * Director's shadow pop-in asked for. At `(4, 8, 12)` the light was 15
 * tiles from its target with a frustum 60 tiles across, so anything on
 * the lit half further than ~15 tiles along the light's axis sat behind
 * the near plane and cast nothing — and as the target followed the
 * camera, casters crossed that plane and their shadows blinked. Fifteen
 * times further out the light is 224 tiles from its target, past the
 * far corner of the widest frustum `followCamera` will size, so no
 * caster in the box reaches the near plane. A directional light does
 * not care about distance; only its shadow camera does.
 */
export const KEY_LIGHT_OFFSET = { x: 60, y: 120, z: 180 } as const;

// ===========================================
// Rig
// ===========================================

/**
 * Builds the key light with shadow casting configured (#507).
 *
 * A `DirectionalLight` shadows only what its orthographic frustum covers,
 * and that frustum is centred on the light's target. Left at the origin
 * it sits on the corner of a 40 × 40 map, so nothing the player is
 * looking at is shadowed at all — which is why `followCamera` exists.
 */
export function createKeyLight(): DirectionalLight {
  const key = new DirectionalLight(0xffffff, SHADOW_TUNING.keyIntensity);
  key.position.set(KEY_LIGHT_OFFSET.x, KEY_LIGHT_OFFSET.y, KEY_LIGHT_OFFSET.z);
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_TUNING.mapSize, SHADOW_TUNING.mapSize);
  const frustum = key.shadow.camera;
  frustum.left = -SHADOW_TUNING.extent;
  frustum.right = SHADOW_TUNING.extent;
  frustum.top = SHADOW_TUNING.extent;
  frustum.bottom = -SHADOW_TUNING.extent;
  frustum.near = SHADOW_TUNING.near;
  frustum.far = SHADOW_TUNING.far;
  frustum.updateProjectionMatrix();
  key.shadow.bias = SHADOW_TUNING.bias;
  key.shadow.normalBias = SHADOW_TUNING.normalBias;
  return key;
}

/**
 * Moves the light and its target so the shadow frustum covers what the
 * camera is looking at.
 *
 * ```
 *   camera position ──┐
 *                     ├─► ground point under the view direction
 *   view direction ───┘            │
 *                                  ├─► light.target
 *                                  └─► light.position = target + offset
 * ```
 *
 * The ground point is where the camera's forward ray crosses `y = 0`,
 * so no camera interface has to expose its target and an orthographic
 * rig at any yaw or zoom is followed correctly. A camera looking level
 * or upward has no such point; the light is then left where it is
 * rather than sent to infinity.
 */
export function followCamera(key: DirectionalLight, camera: Camera): void {
  const forward = new Vector3();
  camera.getWorldDirection(forward);
  if (forward.y >= -1e-6) {
    return;
  }
  const origin = new Vector3();
  camera.getWorldPosition(origin);
  const distance = origin.y / -forward.y;
  const ground = origin.addScaledVector(forward, distance);
  key.target.position.copy(ground);
  key.target.updateMatrixWorld();
  key.position.set(
    ground.x + KEY_LIGHT_OFFSET.x,
    ground.y + KEY_LIGHT_OFFSET.y,
    ground.z + KEY_LIGHT_OFFSET.z,
  );
  key.updateMatrixWorld();
  fitExtent(key, camera, -forward.y);
}

/**
 * The half-width the shadow frustum needs to cover the ground the
 * camera can see, in tiles, from the camera's own frustum.
 *
 * An orthographic view `w` wide and `h` tall, looking down at an
 * elevation whose sine is `sinElevation`, sees `w` tiles across and
 * `h / sinElevation` tiles up the ground. The fixed 60-tile box was
 * smaller than a 1080p view at the plain zoom floor, so the far corners
 * of the screen never had shadows and gained or lost them as the box
 * swept past (the pop-in reported on #1113).
 *
 * @param camera - The view camera; a perspective camera keeps the rest extent.
 * @param sinElevation - Downward component of the camera's forward, in (0, 1].
 * @returns The half-width to use, within the tuning's floor and ceiling.
 */
export function shadowExtentFor(camera: Camera, sinElevation: number): number {
  if (!(camera instanceof OrthographicCamera) || sinElevation <= 0) {
    return SHADOW_TUNING.extent;
  }
  const halfWidth = (camera.right - camera.left) / 2 / camera.zoom;
  const halfHeight = (camera.top - camera.bottom) / 2 / camera.zoom;
  const needed =
    Math.max(halfWidth, halfHeight / sinElevation) + SHADOW_TUNING.extentMargin;
  return Math.min(
    SHADOW_TUNING.maxExtent,
    Math.max(SHADOW_TUNING.extent, needed),
  );
}

/** Resizes the shadow frustum to the view, only when it changes. */
function fitExtent(
  key: DirectionalLight,
  camera: Camera,
  sinElevation: number,
): void {
  const extent = shadowExtentFor(camera, sinElevation);
  const frustum = key.shadow.camera;
  if (frustum.right === extent) {
    return;
  }
  frustum.left = -extent;
  frustum.right = extent;
  frustum.top = extent;
  frustum.bottom = -extent;
  frustum.updateProjectionMatrix();
}
