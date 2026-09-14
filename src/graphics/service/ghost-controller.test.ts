import { describe, expect, it } from "vitest";
import { Object3D, OrthographicCamera } from "three";

import { createGhostUniforms, MAX_GHOSTS } from "./ghost-cutaway";
import { GhostController } from "./ghost-controller";

/** A camera looking down -z from `z = 10`, as the rig sets up. */
function camera(): OrthographicCamera {
  const cam = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

/** An object parked at a world point. */
function at(x: number, y: number, z: number): Object3D {
  const object = new Object3D();
  object.position.set(x, y, z);
  object.updateMatrixWorld(true);
  return object;
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

  it("tells the shader how much nearer a fragment gets per unit it rises (#1132)", () => {
    const uniforms = createGhostUniforms(3, 0.15);
    // Looking straight along -z, height is across the view: no depth.
    new GhostController(camera(), () => [at(0, 0, 0)], uniforms).update(0.016);
    expect(uniforms.uGhostUp.value).toBeCloseTo(0, 5);

    // Pitched down 45°, a unit of height is sin(45°) nearer the camera.
    const pitched = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    pitched.position.set(0, 10, 10);
    pitched.lookAt(0, 0, 0);
    pitched.updateMatrixWorld(true);
    new GhostController(pitched, () => [at(0, 0, 0)], uniforms).update(0.016);
    expect(uniforms.uGhostUp.value).toBeCloseTo(Math.SQRT1_2, 5);
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
