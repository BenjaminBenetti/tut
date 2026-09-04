import type { Camera } from "three";
import { DirectionalLight, Vector3 } from "three";

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
  /** Half-width of the orthographic shadow frustum, in tiles. */
  extent: 30,
  near: 0.5,
  far: 120,
  /** Pulls the depth test off surfaces, against acne on flat ground. */
  bias: -0.0015,
  /** Offsets along the normal, against acne on the slabs' thin edges. */
  normalBias: 0.02,
} as const;

/** Where the key light sits relative to whatever it is lighting. */
export const KEY_LIGHT_OFFSET = { x: 4, y: 8, z: 12 } as const;

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
}
