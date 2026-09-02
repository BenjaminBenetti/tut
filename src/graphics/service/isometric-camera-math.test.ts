import { describe, expect, it } from "vitest";

import type { YawIndex } from "../model/camera-state";
import { CAMERA_ZOOM, ISOMETRIC_ELEVATION_RAD } from "../model/camera-state";
import {
  cameraPosition,
  createCameraState,
  groundScreenAxes,
  horizontalDirection,
  orthoFrustum,
  panBy,
  retarget,
  rotateYaw,
  zoomBy,
} from "./isometric-camera-math";

const YAWS: readonly YawIndex[] = [0, 1, 2, 3];
const TARGET = { x: 8, y: 0, z: 8 };

describe("isometric-camera-math", () => {
  describe("createCameraState", () => {
    it("fills defaults, clamps zoom and copies the target", () => {
      const state = createCameraState({ zoom: 1000, target: TARGET });
      expect(state.yawIndex).toBe(0);
      expect(state.zoom).toBe(CAMERA_ZOOM.max);
      expect(state.target).toEqual(TARGET);
      expect(state.target).not.toBe(TARGET);
    });

    it("uses the style-guide default zoom when none is given", () => {
      expect(createCameraState().zoom).toBe(CAMERA_ZOOM.initial);
    });

    it("rejects a non-finite zoom", () => {
      expect(() => createCameraState({ zoom: Number.NaN })).toThrow(RangeError);
    });
  });

  describe("rotateYaw", () => {
    it("wraps 3→0 turning right and 0→3 turning left", () => {
      expect(
        rotateYaw(createCameraState({ yawIndex: 3 }), "right").yawIndex,
      ).toBe(0);
      expect(
        rotateYaw(createCameraState({ yawIndex: 0 }), "left").yawIndex,
      ).toBe(3);
    });

    it("visits every yaw in order and comes home after four turns", () => {
      let state = createCameraState();
      const seen: YawIndex[] = [];
      for (let i = 0; i < 4; i++) {
        state = rotateYaw(state, "right");
        seen.push(state.yawIndex);
      }
      expect(seen).toEqual([1, 2, 3, 0]);
      for (let i = 0; i < 4; i++) {
        state = rotateYaw(state, "left");
      }
      expect(state.yawIndex).toBe(0);
    });

    it("does not touch zoom or target", () => {
      const state = createCameraState({ zoom: 50, target: TARGET });
      const turned = rotateYaw(state, "right");
      expect(turned.zoom).toBe(50);
      expect(turned.target).toEqual(TARGET);
    });
  });

  describe("zoomBy", () => {
    it("clamps at the minimum", () => {
      const state = createCameraState({ zoom: 50 });
      expect(zoomBy(state, 0.01).zoom).toBe(CAMERA_ZOOM.min);
    });

    it("clamps at the maximum", () => {
      const state = createCameraState({ zoom: 100 });
      expect(zoomBy(state, 100).zoom).toBe(CAMERA_ZOOM.max);
    });

    it("is unchanged by factor 1", () => {
      const state = createCameraState({ zoom: 77 });
      expect(zoomBy(state, 1)).toEqual(state);
    });

    it("scales multiplicatively inside the range", () => {
      const state = createCameraState({ zoom: 50 });
      expect(zoomBy(state, 2).zoom).toBe(100);
      expect(zoomBy(state, 0.9).zoom).toBeCloseTo(45);
    });

    it("rejects non-positive or non-finite factors", () => {
      const state = createCameraState();
      expect(() => zoomBy(state, 0)).toThrow(RangeError);
      expect(() => zoomBy(state, -1)).toThrow(RangeError);
      expect(() => zoomBy(state, Number.POSITIVE_INFINITY)).toThrow(RangeError);
      expect(() => zoomBy(state, Number.NaN)).toThrow(RangeError);
    });
  });

  describe("orthoFrustum", () => {
    it("is viewport.width / zoom wide and viewport.height / zoom tall", () => {
      const state = createCameraState({ zoom: 64 });
      const frustum = orthoFrustum(state, { width: 1280, height: 720 });
      expect(frustum.right - frustum.left).toBeCloseTo(1280 / 64);
      expect(frustum.top - frustum.bottom).toBeCloseTo(720 / 64);
    });

    it("is centred on the view axis", () => {
      const state = createCameraState({ zoom: 40 });
      const frustum = orthoFrustum(state, { width: 1000, height: 500 });
      expect(frustum.left).toBeCloseTo(-frustum.right);
      expect(frustum.bottom).toBeCloseTo(-frustum.top);
    });

    it("keeps one tile at zoom pixels for any viewport", () => {
      const state = createCameraState({ zoom: 128 });
      for (const width of [320, 1024, 3840]) {
        const frustum = orthoFrustum(state, { width, height: width / 2 });
        expect(width / (frustum.right - frustum.left)).toBeCloseTo(128);
      }
    });
  });

  describe("cameraPosition", () => {
    const distance = 100;
    const positions = YAWS.map((yawIndex) =>
      cameraPosition(createCameraState({ yawIndex, target: TARGET }), distance),
    );

    it("shares one height across all four yaws", () => {
      const expectedHeight =
        TARGET.y + distance * Math.sin(ISOMETRIC_ELEVATION_RAD);
      for (const position of positions) {
        expect(position.y).toBeCloseTo(expectedHeight);
      }
    });

    it("is equidistant from the target at every yaw", () => {
      for (const position of positions) {
        const dx = position.x - TARGET.x;
        const dy = position.y - TARGET.y;
        const dz = position.z - TARGET.z;
        expect(Math.hypot(dx, dy, dz)).toBeCloseTo(distance);
      }
    });

    it("steps 90° clockwise around the vertical axis", () => {
      for (let i = 0; i < positions.length; i++) {
        const a = positions[i];
        const b = positions[(i + 1) % positions.length];
        if (!a || !b) {
          throw new Error("unreachable");
        }
        const ax = a.x - TARGET.x;
        const az = a.z - TARGET.z;
        const bx = b.x - TARGET.x;
        const bz = b.z - TARGET.z;
        expect(ax * bx + az * bz).toBeCloseTo(0);
        // Cross product sign is constant, so every step turns the same way.
        expect(ax * bz - az * bx).toBeGreaterThan(0);
      }
    });

    it("sits toward +x +z at yaw 0, above the target", () => {
      const position = positions[0];
      if (!position) {
        throw new Error("unreachable");
      }
      expect(position.x).toBeGreaterThan(TARGET.x);
      expect(position.z).toBeGreaterThan(TARGET.z);
      expect(position.x - TARGET.x).toBeCloseTo(position.z - TARGET.z);
      expect(position.y).toBeGreaterThan(TARGET.y);
    });

    it("looks down at the isometric elevation angle", () => {
      const position = positions[0];
      if (!position) {
        throw new Error("unreachable");
      }
      const ground = Math.hypot(position.x - TARGET.x, position.z - TARGET.z);
      expect(Math.atan2(position.y - TARGET.y, ground)).toBeCloseTo(
        ISOMETRIC_ELEVATION_RAD,
      );
    });
  });

  describe("groundScreenAxes", () => {
    it("returns unit vectors perpendicular to each other and to the view", () => {
      for (const yawIndex of YAWS) {
        const { right, up } = groundScreenAxes(yawIndex);
        const toCamera = horizontalDirection(yawIndex);
        expect(Math.hypot(right.x, right.z)).toBeCloseTo(1);
        expect(Math.hypot(up.x, up.z)).toBeCloseTo(1);
        expect(right.x * up.x + right.z * up.z).toBeCloseTo(0);
        expect(up.x).toBeCloseTo(-toCamera.x);
        expect(up.z).toBeCloseTo(-toCamera.z);
      }
    });
  });

  describe("panBy", () => {
    it("moves the target in opposite ground directions at yaw 0 and yaw 2", () => {
      const front = panBy(
        createCameraState({ yawIndex: 0, target: TARGET }),
        30,
        -20,
      );
      const back = panBy(
        createCameraState({ yawIndex: 2, target: TARGET }),
        30,
        -20,
      );
      expect(front.target.x - TARGET.x).toBeCloseTo(
        -(back.target.x - TARGET.x),
      );
      expect(front.target.z - TARGET.z).toBeCloseTo(
        -(back.target.z - TARGET.z),
      );
      expect(
        Math.hypot(front.target.x - TARGET.x, front.target.z - TARGET.z),
      ).toBeGreaterThan(0);
    });

    it("never changes the target height", () => {
      const state = createCameraState({ target: { x: 1, y: 3, z: 2 } });
      expect(panBy(state, 100, 100).target.y).toBe(3);
    });

    it("moves one unit along ground-right for zoom pixels of screen-right", () => {
      for (const yawIndex of YAWS) {
        const state = createCameraState({ yawIndex, zoom: 64, target: TARGET });
        const { right } = groundScreenAxes(yawIndex);
        const moved = panBy(state, 64, 0);
        expect(moved.target.x - TARGET.x).toBeCloseTo(right.x);
        expect(moved.target.z - TARGET.z).toBeCloseTo(right.z);
      }
    });

    it("compensates screen-up for the elevation foreshortening", () => {
      const state = createCameraState({
        yawIndex: 0,
        zoom: 64,
        target: TARGET,
      });
      const { up } = groundScreenAxes(0);
      const pixels = 64 * Math.sin(ISOMETRIC_ELEVATION_RAD);
      const moved = panBy(state, 0, -pixels);
      expect(moved.target.x - TARGET.x).toBeCloseTo(up.x);
      expect(moved.target.z - TARGET.z).toBeCloseTo(up.z);
    });

    it("pans further per pixel when zoomed out", () => {
      const near = panBy(createCameraState({ zoom: 128 }), 100, 0);
      const far = panBy(createCameraState({ zoom: 40 }), 100, 0);
      const nearDist = Math.hypot(near.target.x, near.target.z);
      const farDist = Math.hypot(far.target.x, far.target.z);
      expect(farDist).toBeCloseTo(nearDist * (128 / 40));
    });
  });

  describe("retarget", () => {
    it("replaces the target with a copy", () => {
      const state = retarget(createCameraState(), TARGET);
      expect(state.target).toEqual(TARGET);
      expect(state.target).not.toBe(TARGET);
    });
  });
});
