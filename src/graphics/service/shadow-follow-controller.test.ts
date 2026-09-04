import { DirectionalLight, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { ShadowFollowController } from "./shadow-follow-controller";

/** A light at the style guide's key offset. */
function keyLight(): DirectionalLight {
  const light = new DirectionalLight(0xffffff, 2.9);
  light.position.set(4, 8, 12);
  return light;
}

/** A camera at `from` looking at `at`, with its matrices settled. */
function cameraLookingAt(from: Vector3, at: Vector3): PerspectiveCamera {
  const camera = new PerspectiveCamera();
  camera.position.copy(from);
  camera.lookAt(at);
  camera.updateMatrixWorld(true);
  return camera;
}

describe("ShadowFollowController", () => {
  it("puts the frustum over the ground the camera is looking at", () => {
    const light = keyLight();
    const target = new Vector3(20, 0, 14);
    const camera = cameraLookingAt(new Vector3(30, 25, 24), target);
    new ShadowFollowController(light, camera).update(0.016);
    // The light aims at the ground point under the view, not the origin,
    // which on a 40 x 40 map is a corner.
    expect(light.target.position.x).toBeCloseTo(target.x, 4);
    expect(light.target.position.z).toBeCloseTo(target.z, 4);
    expect(light.target.position.y).toBeCloseTo(0, 4);
  });

  it("keeps the light's direction fixed while it moves", () => {
    const light = keyLight();
    const camera = cameraLookingAt(new Vector3(30, 25, 24), new Vector3(20, 0, 14));
    new ShadowFollowController(light, camera).update(0.016);
    // §12.1's whole promise is that a face shades the same way at every
    // yaw, so the offset between light and target may never change.
    const direction = new Vector3().subVectors(
      light.position,
      light.target.position,
    );
    expect(direction.x).toBeCloseTo(4, 4);
    expect(direction.y).toBeCloseTo(8, 4);
    expect(direction.z).toBeCloseTo(12, 4);
  });

  it("ignores a nudge too small to change the shadow map", () => {
    const light = keyLight();
    const camera = cameraLookingAt(new Vector3(30, 25, 24), new Vector3(20, 0, 14));
    const controller = new ShadowFollowController(light, camera);
    controller.update(0.016);
    const settled = light.target.position.clone();
    camera.position.x += 0.05;
    camera.updateMatrixWorld(true);
    controller.update(0.016);
    expect(light.target.position.equals(settled)).toBe(true);
  });

  it("leaves the light alone when the view cannot meet the ground", () => {
    const light = keyLight();
    const before = light.position.clone();
    // Looking level, and then up: neither ray ever reaches y = 0 ahead.
    const camera = cameraLookingAt(new Vector3(0, 5, 0), new Vector3(10, 5, 0));
    new ShadowFollowController(light, camera).update(0.016);
    expect(light.position.equals(before)).toBe(true);
  });
});
