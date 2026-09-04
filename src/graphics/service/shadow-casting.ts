import type { Object3D } from "three";
import { Mesh } from "three";

// ===========================================
// Shadow casting
// ===========================================

/**
 * Marks every mesh under `root` as both casting and receiving shadows
 * (#507).
 *
 * Done once when the object is built, never per frame. The first pass at
 * this brute-forced the flags with a `traverse` inside the render loop,
 * which is a full walk of the city on every frame to set values that
 * only change when the scene graph does.
 *
 * Only what the player should see grounded gets this: the map, its
 * props and the units. It is deliberately *not* applied to the tile
 * overlays or the unit rings -- three defaults both flags to false, so
 * anything not passed here stays out of the shadow pass, which is what
 * a mark painted on the floor wants. A move-range quad that cast a
 * shadow would draw a second, offset copy of itself on the ground.
 *
 * @param root - Subtree to mark; safe to call on an object with no meshes.
 */
export function enableShadowCasting(root: Object3D): void {
  root.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}
