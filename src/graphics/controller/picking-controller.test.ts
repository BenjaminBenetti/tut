import type { Camera } from "three";
import { OrthographicCamera } from "three";
import { describe, expect, it } from "vitest";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { SceneCamera } from "../model/scene-camera";
import type { PickingSurface } from "./map-picking-controller";
import { MAP_PICKING_TUNING } from "./map-picking-controller";
import type { Picker } from "./picking-controller";
import { PickingController, unitPickerAdapter } from "./picking-controller";

type Listener = (event: unknown) => void;

/** Records listeners so tests can dispatch to them and audit removal. */
class FakeSurface {
  readonly listeners = new Map<string, Set<Listener>>();
  rect = { left: 0, top: 0, width: 400, height: 400 };
  addEventListener(type: string, listener: unknown): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: unknown): void {
    this.listeners.get(type)?.delete(listener as Listener);
  }
  getBoundingClientRect(): typeof this.rect {
    return this.rect;
  }
  dispatch(type: string, event: Record<string, unknown> = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
  totalListeners(): number {
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }
  asSurface(): PickingSurface {
    return this as unknown as PickingSurface;
  }
}

/** Picks "left" on the left half of the surface and "right" on the right. */
class FakePicker implements Picker<string> {
  hovered: string | undefined;
  selected: string | undefined;
  readonly hoverCalls: (string | undefined)[] = [];
  pick(ndc: Vec2, _camera: Camera): string | undefined {
    if (ndc.x < -0.2) return "left";
    if (ndc.x > 0.2) return "right";
    return undefined;
  }
  setHovered(id: string | undefined): void {
    this.hovered = id;
    this.hoverCalls.push(id);
  }
  setSelected(id: string | undefined): void {
    this.selected = id;
  }
  worldPosition(id: string): Vec3 | undefined {
    return id === "left" ? { x: -1, y: 0, z: 0 } : undefined;
  }
}

const sceneCamera = (): SceneCamera => {
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 10);
  camera.position.set(0, 5, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return { camera, resize: () => undefined, apply: () => undefined };
};

describe("PickingController", () => {
  it("hovers what is under the pointer and reports only changes", () => {
    const picker = new FakePicker();
    const controller = new PickingController(picker, sceneCamera(), {
      onSelected: () => undefined,
    });
    const surface = new FakeSurface();
    controller.attach(surface.asSurface());
    surface.dispatch("pointermove", { clientX: 20, clientY: 200 });
    surface.dispatch("pointermove", { clientX: 30, clientY: 200 });
    surface.dispatch("pointermove", { clientX: 380, clientY: 200 });
    surface.dispatch("pointerleave");
    expect(picker.hoverCalls).toEqual(["left", "right", undefined]);
  });

  it("selects on a click but not after a drag, and reports it", () => {
    const picker = new FakePicker();
    const selected: string[] = [];
    const controller = new PickingController(picker, sceneCamera(), {
      onSelected: (id) => selected.push(id),
    });
    const surface = new FakeSurface();
    controller.attach(surface.asSurface());
    surface.dispatch("pointerdown", { clientX: 20, clientY: 200 });
    surface.dispatch("pointerup", {
      clientX: 20 + MAP_PICKING_TUNING.clickSlopPx + 1,
      clientY: 200,
    });
    expect(selected).toEqual([]);
    surface.dispatch("pointerdown", { clientX: 380, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 381, clientY: 200 });
    expect(selected).toEqual(["right"]);
    expect(picker.selected).toBe("right");
  });

  it("select() marks and reports without pointer input; detach clears listeners and hover", () => {
    const picker = new FakePicker();
    const selected: string[] = [];
    const controller = new PickingController(picker, sceneCamera(), {
      onSelected: (id) => selected.push(id),
    });
    const surface = new FakeSurface();
    controller.attach(surface.asSurface());
    controller.select("left");
    expect(selected).toEqual(["left"]);
    surface.dispatch("pointermove", { clientX: 20, clientY: 200 });
    controller.detach();
    expect(surface.totalListeners()).toBe(0);
    expect(picker.hovered).toBeUndefined();
    expect(controller.isAttached()).toBe(false);
  });

  it("projects a thing's world position to client pixels", () => {
    const picker = new FakePicker();
    const controller = new PickingController(picker, sceneCamera(), {
      onSelected: () => undefined,
    });
    expect(controller.screenPositionOf("left")).toBeUndefined();
    const surface = new FakeSurface();
    controller.attach(surface.asSurface());
    const at = controller.screenPositionOf("left");
    expect(at?.x).toBeLessThan(200);
    expect(controller.screenPositionOf("right")).toBeUndefined();
  });

  it("adapts a unit picker to the generic contract", () => {
    const calls: string[] = [];
    const adapted = unitPickerAdapter<string>({
      pickUnit: () => "u1",
      setHovered: (id) => calls.push(`hover:${id ?? "none"}`),
      setSelected: (id) => calls.push(`select:${id ?? "none"}`),
      unitWorldPosition: () => ({ x: 1, y: 2, z: 3 }),
    });
    expect(adapted.pick({ x: 0, y: 0 }, sceneCamera().camera)).toBe("u1");
    adapted.setHovered("u1");
    adapted.setSelected(undefined);
    expect(calls).toEqual(["hover:u1", "select:none"]);
    expect(adapted.worldPosition("u1")).toEqual({ x: 1, y: 2, z: 3 });
  });
});
