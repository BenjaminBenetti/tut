import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  CAMERA_ZOOM,
  ISOMETRIC_ELEVATION_RAD,
  TOP_DOWN_PROJECTION,
} from "../model/camera-state";
import { cameraPosition, groundScreenAxes } from "./isometric-camera-math";
import { CAMERA_DISTANCE, IsometricCameraRig } from "./isometric-camera-rig";

const TARGET = { x: 8, y: 0, z: 8 };
const WIDTH = 1280;
const HEIGHT = 720;

function makeRig(): IsometricCameraRig {
  const rig = new IsometricCameraRig({ target: TARGET });
  rig.resize(WIDTH, HEIGHT);
  rig.apply();
  return rig;
}

function projectToPixels(rig: IsometricCameraRig, point: Vector3): Vector3 {
  const ndc = point.clone().project(rig.camera);
  return new Vector3((ndc.x * WIDTH) / 2, (ndc.y * HEIGHT) / 2, ndc.z);
}

describe("IsometricCameraRig", () => {
  it("starts from defaults merged with the given overrides", () => {
    const rig = new IsometricCameraRig({ yawIndex: 2, target: TARGET });
    expect(rig.getState()).toEqual({
      yawIndex: 2,
      zoom: CAMERA_ZOOM.initial,
      target: TARGET,
    });
  });

  it("fits the frustum so one world unit spans zoom pixels", () => {
    const rig = makeRig();
    const { zoom } = rig.getState();
    expect(rig.camera.right - rig.camera.left).toBeCloseTo(WIDTH / zoom);
    expect(rig.camera.top - rig.camera.bottom).toBeCloseTo(HEIGHT / zoom);
  });

  it("keeps one tile at zoom pixels after a resize", () => {
    const rig = makeRig();
    rig.resize(3840, 2160);
    rig.apply();
    const { zoom } = rig.getState();
    expect(3840 / (rig.camera.right - rig.camera.left)).toBeCloseTo(zoom);
    expect(2160 / (rig.camera.top - rig.camera.bottom)).toBeCloseTo(zoom);
  });

  it("places the camera where the pure math says and looks at the target", () => {
    const rig = makeRig();
    const expected = cameraPosition(rig.getState(), CAMERA_DISTANCE);
    expect(rig.camera.position.x).toBeCloseTo(expected.x);
    expect(rig.camera.position.y).toBeCloseTo(expected.y);
    expect(rig.camera.position.z).toBeCloseTo(expected.z);

    const centre = projectToPixels(
      rig,
      new Vector3(TARGET.x, TARGET.y, TARGET.z),
    );
    expect(centre.x).toBeCloseTo(0);
    expect(centre.y).toBeCloseTo(0);
  });

  it("projects one ground unit to screen-right as zoom pixels", () => {
    const rig = makeRig();
    const { zoom, yawIndex } = rig.getState();
    const { right } = groundScreenAxes(yawIndex);
    const point = new Vector3(TARGET.x + right.x, TARGET.y, TARGET.z + right.z);
    const pixels = projectToPixels(rig, point);
    expect(pixels.x).toBeCloseTo(zoom);
    expect(pixels.y).toBeCloseTo(0);
  });

  it("foreshortens one ground unit to screen-up by the elevation", () => {
    const rig = makeRig();
    const { zoom, yawIndex } = rig.getState();
    const { up } = groundScreenAxes(yawIndex);
    const point = new Vector3(TARGET.x + up.x, TARGET.y, TARGET.z + up.z);
    const pixels = projectToPixels(rig, point);
    expect(pixels.x).toBeCloseTo(0);
    expect(pixels.y).toBeCloseTo(zoom * Math.sin(ISOMETRIC_ELEVATION_RAD));
  });

  it("only writes the three camera in apply()", () => {
    const rig = makeRig();
    const before = rig.camera.right - rig.camera.left;
    rig.zoomBy(2);
    rig.rotateRight();
    rig.panBy(100, 0);
    rig.lookAt({ x: 0, y: 0, z: 0 });
    expect(rig.camera.right - rig.camera.left).toBe(before);
    rig.apply();
    expect(rig.camera.right - rig.camera.left).toBeCloseTo(before / 2);
    const centre = projectToPixels(rig, new Vector3(0, 0, 0));
    expect(centre.x).toBeCloseTo(0);
    expect(centre.y).toBeCloseTo(0);
  });

  it("rotates through four steps and returns to the same camera position", () => {
    const rig = makeRig();
    const start = rig.camera.position.clone();
    for (let i = 0; i < 4; i++) {
      rig.rotateLeft();
      rig.apply();
      if (i < 3) {
        expect(rig.camera.position.distanceTo(start)).toBeGreaterThan(1);
      }
    }
    expect(rig.camera.position.distanceTo(start)).toBeCloseTo(0);
  });

  it("setBounds clamps the target now and on every later pan and lookAt (#218)", () => {
    const rig = new IsometricCameraRig({ target: { x: 50, y: 0, z: 50 } });
    rig.setBounds({ x: 0, z: 0, w: 24, d: 12 });
    expect(rig.getState().target).toEqual({ x: 24, y: 0, z: 12 });
    for (let i = 0; i < 100; i++) {
      rig.panBy(-500, 500);
    }
    const { target } = rig.getState();
    expect(target.x).toBeGreaterThanOrEqual(0);
    expect(target.z).toBeGreaterThanOrEqual(0);
    rig.lookAt({ x: -10, y: 0, z: 5 });
    expect(rig.getState().target).toEqual({ x: 0, y: 0, z: 5 });
    rig.setBounds(undefined);
    rig.panBy(-5000, 0);
    expect(rig.getState().target.x).toBeLessThan(-10);
  });
});

describe("IsometricCameraRig with the top-down projection (#420)", () => {
  it("sits straight above the target and orients the map north up", () => {
    const rig = new IsometricCameraRig({
      target: TARGET,
      projection: TOP_DOWN_PROJECTION,
    });
    rig.resize(WIDTH, HEIGHT);
    rig.apply();
    expect(rig.camera.position.x).toBeCloseTo(TARGET.x);
    expect(rig.camera.position.z).toBeCloseTo(TARGET.z);
    expect(rig.camera.position.y).toBeCloseTo(TARGET.y + CAMERA_DISTANCE);
    // +y would be parallel to the view direction and give three no basis.
    expect(rig.camera.up.x).toBeCloseTo(0);
    expect(rig.camera.up.y).toBe(0);
    expect(rig.camera.up.z).toBeCloseTo(-1);
    // North (-z) projects above the target on screen, east (+x) to its right.
    const north = new Vector3(TARGET.x, 0, TARGET.z - 1).project(rig.camera);
    const east = new Vector3(TARGET.x + 1, 0, TARGET.z).project(rig.camera);
    expect(north.y).toBeGreaterThan(0);
    expect(east.x).toBeGreaterThan(0);
  });
});
