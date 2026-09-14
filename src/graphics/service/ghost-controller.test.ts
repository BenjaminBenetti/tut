import { describe, expect, it } from "vitest";
import { Object3D, OrthographicCamera } from "three";

import type { GhostSubject } from "./ghost-cutaway";
import {
  createGhostUniforms,
  GHOST_RING_MARGIN,
  GHOST_SAMPLES,
  MAX_GHOSTS,
} from "./ghost-cutaway";
import { GhostController } from "./ghost-controller";

/** A camera looking down -z from `z = 10`, as the rig sets up. */
function camera(): OrthographicCamera {
  const cam = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

/** A one-tile, one-unit-tall subject parked at a world point. */
function at(x: number, y: number, z: number): GhostSubject {
  const object = new Object3D();
  object.position.set(x, y, z);
  object.updateMatrixWorld(true);
  return { object, halfWidth: 0.5, height: 1 };
}

describe("GhostController (#526)", () => {
  it("puts each unit's centre in view space, not world space", () => {
    const uniforms = createGhostUniforms(3, 0.15);
    const cam = camera();
    const unit = at(2, 1, 0);
    new GhostController(cam, () => [unit], uniforms).update(0.016);

    // The camera sits at z = 10 looking down -z, so a unit at the origin
    // plane is 10 in front of it: view z = -10.
    const centre = uniforms.uGhostCentres.value[0]!;
    expect(uniforms.uGhostCount.value).toBe(1);
    expect(centre.x).toBeCloseTo(2, 5);
    expect(centre.y).toBeCloseTo(1, 5);
    expect(centre.z).toBeCloseTo(-10, 5);
  });

  it("records each unit's feet in world height, whatever the camera does (#1118)", () => {
    const uniforms = createGhostUniforms(3, 0.15);
    const cam = camera();
    const ground = at(2, 0, 0);
    const upstairs = at(5, 3, 0);
    const controller = new GhostController(
      cam,
      () => [ground, upstairs],
      uniforms,
    );
    controller.update(0.016);

    expect(uniforms.uGhostFeet.value[0]).toBeCloseTo(0, 5);
    expect(uniforms.uGhostFeet.value[1]).toBeCloseTo(3, 5);

    // Height is a world fact, not a view one: a moved camera leaves it.
    cam.position.set(4, 7, 10);
    cam.updateMatrixWorld(true);
    controller.update(0.016);
    expect(uniforms.uGhostFeet.value[1]).toBeCloseTo(3, 5);
  });

  it("hands the shader the unit's sample points in view space, lengths kept (#1134)", () => {
    const uniforms = createGhostUniforms(3, 0.15);
    // Looking straight along -z: world x is view x, world y is view y,
    // and a two-tile, 1.8-tall brute's box keeps those lengths. The
    // spots are precomputed here, not in the shader, so the fragment
    // loop reads a uniform instead of rebuilding them per pixel.
    const brute = { ...at(0, 0, 0), halfWidth: 1, height: 1.8 };
    new GhostController(camera(), () => [brute], uniforms).update(0.016);
    const spot = (s: number): number[] =>
      uniforms.uGhostSpots.value[s]!.toArray().map((v) => +v.toFixed(5));
    // Feet corners, then head corners, then head, waist, feet centres.
    expect(spot(0)).toEqual([-1, 0, -11]);
    expect(spot(1)).toEqual([1, 0, -11]);
    expect(spot(2)).toEqual([-1, 0, -9]);
    expect(spot(3)).toEqual([1, 0, -9]);
    expect(spot(4)).toEqual([-1, 1.8, -11]);
    expect(spot(7)).toEqual([1, 1.8, -9]);
    expect(spot(8)).toEqual([0, 1.8, -10]);
    expect(spot(9)).toEqual([0, 0.9, -10]);
    expect(spot(10)).toEqual([0, 0, -10]);
    // Then the waist ring (#1138), GHOST_RING_MARGIN outside the box:
    // 1.75 out for a half width of 1, at 0.9 up, from +x toward +z.
    expect(spot(11)).toEqual([1.75, 0.9, -10]);
    expect(spot(13)).toEqual([0, 0.9, -8.25]);
    expect(spot(15)).toEqual([-1.75, 0.9, -10]);
    // `toFixed` keeps the sign of cos(3π/2)'s rounding noise; the value is 0.
    expect(spot(17).map((v) => v + 0)).toEqual([0, 0.9, -11.75]);
    // The farthest spot on the view plane is a head corner, √(1 + 1.8²)
    // from the centre — the ring's √(1.75² + 0.9²) is inside that — and
    // the reach adds the ray radius.
    expect(uniforms.uGhostReach.value[0]).toBeCloseTo(
      Math.hypot(1, 1.8) + 3,
      5,
    );

    // Pitched down 45°, a unit of height is sin(45°) nearer the camera
    // and cos(45°) up the view plane: the edge is rotated, not shrunk.
    const pitched = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    pitched.position.set(0, 10, 10);
    pitched.lookAt(0, 0, 0);
    pitched.updateMatrixWorld(true);
    new GhostController(pitched, () => [brute], uniforms).update(0.016);
    const feet = uniforms.uGhostSpots.value[10]!;
    const head = uniforms.uGhostSpots.value[8]!;
    expect(head.z - feet.z).toBeCloseTo(1.8 * Math.SQRT1_2, 5);
    expect(head.y - feet.y).toBeCloseTo(1.8 * Math.SQRT1_2, 5);
  });

  it("writes each ghost's spots into its own stretch of the flat array (#1134)", () => {
    const uniforms = createGhostUniforms(3, 0.15);
    const units = [at(0, 0, 0), at(4, 0, 0)];
    new GhostController(camera(), () => units, uniforms).update(0.016);

    // Ghost 1's feet centre sits at index 1 * GHOST_SAMPLES + 10, where
    // the shader reads it.
    const second = uniforms.uGhostSpots.value[GHOST_SAMPLES + 10]!;
    expect(second.x).toBeCloseTo(4, 5);
    expect(uniforms.uGhostSpots.value).toHaveLength(MAX_GHOSTS * GHOST_SAMPLES);
    // Half a tile wide and a unit tall, seen square on: the ring's side
    // point, a tile and a quarter out at the waist, is the farthest spot
    // across the view (past the head corner's √(0.5² + 1²) since #1138),
    // and depth does not count.
    expect(uniforms.uGhostReach.value[1]).toBeCloseTo(
      Math.hypot(0.5 + GHOST_RING_MARGIN, 0.5) + 3,
      5,
    );
  });

  it("follows the camera, so panning does not smear the cutaway", () => {
    const uniforms = createGhostUniforms(3, 0.15);
    const cam = camera();
    const unit = at(0, 0, 0);
    const controller = new GhostController(cam, () => [unit], uniforms);
    controller.update(0.016);
    const before = uniforms.uGhostCentres.value[0]!.clone();

    cam.position.set(4, 0, 10);
    cam.updateMatrixWorld(true);
    controller.update(0.016);

    const after = uniforms.uGhostCentres.value[0]!;
    expect(after.x).toBeCloseTo(before.x - 4, 5);
  });

  it("reads the drawn objects each frame, so a dead unit stops ghosting", () => {
    const uniforms = createGhostUniforms(3, 0.15);
    let units = [at(0, 0, 0), at(1, 0, 0)];
    const controller = new GhostController(camera(), () => units, uniforms);
    controller.update(0.016);
    expect(uniforms.uGhostCount.value).toBe(2);

    units = [];
    controller.update(0.016);

    // No bookkeeping: the scene stopped drawing it, so it stops ghosting.
    expect(uniforms.uGhostCount.value).toBe(0);
  });

  it("never writes past the uniform array", () => {
    const uniforms = createGhostUniforms(3, 0.15);
    const many = Array.from({ length: MAX_GHOSTS + 5 }, (_, i) => at(i, 0, 0));

    new GhostController(camera(), () => many, uniforms).update(0.016);

    expect(uniforms.uGhostCount.value).toBe(MAX_GHOSTS);
    expect(uniforms.uGhostCentres.value).toHaveLength(MAX_GHOSTS);
  });
});

describe("GhostController fade (#526, style guide §12.4)", () => {
  it("ramps a new cutaway in rather than snapping it open", () => {
    const uniforms = createGhostUniforms(2, 0.35);
    const unit = at(0, 0, 0);
    const controller = new GhostController(camera(), () => [unit], uniforms);

    controller.update(0.05);
    const early = uniforms.uGhostStrength.value[0] ?? 0;

    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(1);
  });

  it("reaches full strength in the configured 0.15s and stops there", () => {
    const uniforms = createGhostUniforms(2, 0.35);
    const unit = at(0, 0, 0);
    const controller = new GhostController(camera(), () => [unit], uniforms);

    for (let i = 0; i < 3; i++) controller.update(0.05);
    expect(uniforms.uGhostStrength.value[0]).toBeCloseTo(1, 5);

    controller.update(0.05);
    expect(uniforms.uGhostStrength.value[0]).toBeCloseTo(1, 5);
  });

  it("ramps out when the unit goes, and keeps the slot live while it does", () => {
    const uniforms = createGhostUniforms(2, 0.35);
    let units = [at(0, 0, 0)];
    const controller = new GhostController(camera(), () => units, uniforms);
    for (let i = 0; i < 3; i++) controller.update(0.05);

    units = [];
    controller.update(0.05);

    // Still drawing, or the cutaway would snap shut a frame after a death.
    expect(uniforms.uGhostStrength.value[0]).toBeGreaterThan(0);
    expect(uniforms.uGhostCount.value).toBeGreaterThan(0);
  });
});
