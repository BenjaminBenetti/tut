// @vitest-environment jsdom
import { OrthographicCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PointerCutawayPicker,
  PointerCutawayTarget,
} from "../model/pointer-cutaway";
import { createGhostUniforms } from "../service/ghost-cutaway";
import { PointerCutawayController } from "./pointer-cutaway-controller";

/** Real canvas events with a deterministic graphics hit result. */
function fixture() {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 100, 100),
  );
  let target: PointerCutawayTarget | undefined = {
    buildingId: "house",
    centre: { x: 0, y: 1, z: 0 },
  };
  const picker = {
    cutawayRevision: 0,
    pickCutaway: vi.fn<PointerCutawayPicker["pickCutaway"]>(() => target),
  };
  const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  const uniforms = createGhostUniforms(4, 0.175);
  const controller = new PointerCutawayController(picker, camera, uniforms);
  controller.attach(canvas);
  return {
    canvas,
    picker,
    camera,
    uniforms,
    controller,
    setTarget: (value: PointerCutawayTarget | undefined) => {
      target = value;
    },
    move: (x = 50) =>
      canvas.dispatchEvent(
        new MouseEvent("pointermove", { clientX: x, clientY: 50 }),
      ),
    open: () => {
      canvas.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 50, clientY: 50 }),
      );
      controller.update(0.12);
      controller.update(0.15);
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("pointer cutaway (#947)", () => {
  it("rejects a brief building sweep, then opens without changing the force source", () => {
    const f = fixture();
    f.uniforms.uGhostCount.value = 1;
    f.uniforms.uGhostStrength.value[0] = 0.8;
    f.move();
    f.controller.update(0.1);
    expect(f.uniforms.uPointerStrength.value).toBe(0);
    f.setTarget(undefined);
    f.move(90);
    f.controller.update(0.05);
    expect(f.uniforms.uPointerStrength.value).toBe(0);
    f.setTarget({ buildingId: "house", centre: { x: 0, y: 1, z: 0 } });
    f.open();
    expect(f.uniforms.uPointerStrength.value).toBe(1);
    expect(f.uniforms.uGhostCount.value).toBe(1);
    expect(f.uniforms.uGhostStrength.value[0]).toBe(0.8);
    expect(f.uniforms.uGhostCentres.value).toHaveLength(8);
    expect(f.uniforms.uGhostRadius.value).toBe(4);
    f.controller.detach();
  });

  it("keeps continuous raw positions within one building and caches a stationary pick", () => {
    const f = fixture();
    f.open();
    for (let i = 0; i < 10; i++) f.controller.update(0.02);
    expect(f.picker.pickCutaway).toHaveBeenCalledTimes(1);
    f.setTarget({ buildingId: "house", centre: { x: 0.137, y: 1, z: 0 } });
    f.move(51.37);
    f.controller.update(0.01);
    expect(f.uniforms.uPointerCentre.value.x).toBeCloseTo(0.137);
    expect(f.uniforms.uPointerStrength.value).toBe(1);
    expect(f.picker.pickCutaway.mock.calls[1]?.[0].x).toBeCloseTo(0.0274);
    expect(f.picker.pickCutaway.mock.calls[1]?.[0].y).toBe(0);
    f.controller.detach();
  });

  it("fades closed on open ground and after leaving the canvas", () => {
    const f = fixture();
    f.open();
    f.setTarget(undefined);
    f.move(90);
    f.controller.update(0.05);
    expect(f.uniforms.uPointerStrength.value).toBeCloseTo(2 / 3);
    f.controller.update(0.1);
    expect(f.uniforms.uPointerStrength.value).toBe(0);
    f.setTarget({ buildingId: "house", centre: { x: 0, y: 1, z: 0 } });
    f.open();
    f.canvas.dispatchEvent(new Event("pointerleave"));
    f.controller.update(0.15);
    expect(f.uniforms.uPointerStrength.value).toBe(0);
    f.controller.detach();
  });

  it("closes at the old building before transferring to a different building", () => {
    const f = fixture();
    f.open();
    const old = f.uniforms.uPointerCentre.value.clone();
    f.setTarget({ buildingId: "other", centre: { x: 7, y: 1, z: 0 } });
    f.move(80);
    f.controller.update(0.05);
    expect(f.uniforms.uPointerCentre.value.equals(old)).toBe(true);
    expect(f.uniforms.uPointerStrength.value).toBeCloseTo(2 / 3);
    f.controller.update(0.1);
    f.controller.update(0.15);
    expect(f.uniforms.uPointerCentre.value.x).toBe(7);
    expect(f.uniforms.uPointerStrength.value).toBe(1);
    f.controller.detach();
  });

  it("repicks for camera and level/model changes without a new mouse event", () => {
    const f = fixture();
    f.open();
    f.camera.position.x = 2;
    f.controller.update(0.01);
    expect(f.picker.pickCutaway).toHaveBeenCalledTimes(2);
    f.picker.cutawayRevision++;
    f.controller.update(0.01);
    expect(f.picker.pickCutaway).toHaveBeenCalledTimes(3);
    f.controller.detach();
  });

  it("closes during a drag and removes canvas/document/focus listeners on detach", () => {
    const f = fixture();
    f.open();
    f.canvas.dispatchEvent(new MouseEvent("pointerdown", { buttons: 4 }));
    f.controller.update(0.15);
    expect(f.uniforms.uPointerStrength.value).toBe(0);
    document.dispatchEvent(new MouseEvent("pointerup"));
    f.controller.update(0.12);
    f.controller.update(0.15);
    expect(f.uniforms.uPointerStrength.value).toBe(1);
    window.dispatchEvent(new Event("blur"));
    f.controller.update(0.15);
    expect(f.uniforms.uPointerStrength.value).toBe(0);
    f.controller.detach();
    const calls = f.picker.pickCutaway.mock.calls.length;
    f.move();
    document.dispatchEvent(new MouseEvent("pointerup"));
    f.controller.update(0.5);
    expect(f.picker.pickCutaway.mock.calls).toHaveLength(calls);
    expect(f.uniforms.uPointerStrength.value).toBe(0);
  });
});
