import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  createKeyLight,
  followCamera,
  KEY_LIGHT_OFFSET,
  SHADOW_TUNING,
} from "./shadow-rig";

/** An isometric-ish camera looking down at `target` from above. */
function lookingAt(target: { x: number; z: number }): OrthographicCamera {
  const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  camera.position.set(target.x + 20, 20, target.z + 20);
  camera.lookAt(new Vector3(target.x, 0, target.z));
  camera.updateMatrixWorld(true);
  return camera;
}

describe("createKeyLight", () => {
  it("casts, with a frustum big enough to cover what is on screen", () => {
    const key = createKeyLight();
    expect(key.castShadow).toBe(true);
    expect(key.shadow.mapSize.width).toBe(SHADOW_TUNING.mapSize);
    expect(key.shadow.camera.left).toBe(-SHADOW_TUNING.extent);
    expect(key.shadow.camera.right).toBe(SHADOW_TUNING.extent);
    expect(key.shadow.camera.far).toBe(SHADOW_TUNING.far);
  });

  it("carries the bias the flat ground needs, so slabs do not shadow themselves", () => {
    const key = createKeyLight();
    expect(key.shadow.bias).toBe(SHADOW_TUNING.bias);
    expect(key.shadow.normalBias).toBe(SHADOW_TUNING.normalBias);
  });
});

describe("followCamera", () => {
  it("puts the shadow frustum over the ground the camera is looking at", () => {
    // The whole point: a light left targeting the origin shadows the
    // corner of a 40 x 40 map and nothing the player can see (#507).
    const key = createKeyLight();
    followCamera(key, lookingAt({ x: 30, z: 18 }));
    expect(key.target.position.x).toBeCloseTo(30, 1);
    expect(key.target.position.z).toBeCloseTo(18, 1);
    expect(key.target.position.y).toBeCloseTo(0, 5);
  });

  it("keeps the light at its fixed offset from what it lights", () => {
    const key = createKeyLight();
    followCamera(key, lookingAt({ x: 12, z: 7 }));
    expect(key.position.x - key.target.position.x).toBeCloseTo(
      KEY_LIGHT_OFFSET.x,
      5,
    );
    expect(key.position.y - key.target.position.y).toBeCloseTo(
      KEY_LIGHT_OFFSET.y,
      5,
    );
    expect(key.position.z - key.target.position.z).toBeCloseTo(
      KEY_LIGHT_OFFSET.z,
      5,
    );
  });

  it("follows the camera when it pans, rather than staying put", () => {
    const key = createKeyLight();
    followCamera(key, lookingAt({ x: 0, z: 0 }));
    const first = key.target.position.clone();
    followCamera(key, lookingAt({ x: 25, z: 25 }));
    expect(key.target.position.distanceTo(first)).toBeGreaterThan(20);
  });

  it("leaves the light alone for a camera that cannot see the ground", () => {
    // Looking level or upward has no ground crossing; sending the light
    // to infinity would blank every shadow on screen.
    const key = createKeyLight();
    followCamera(key, lookingAt({ x: 5, z: 5 }));
    const before = key.target.position.clone();
    const level = new OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    level.position.set(0, 5, 0);
    level.lookAt(new Vector3(10, 5, 0));
    level.updateMatrixWorld(true);
    followCamera(key, level);
    expect(key.target.position).toEqual(before);
  });
});
