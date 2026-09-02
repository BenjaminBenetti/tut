import { describe, expect, it } from "vitest";

import type { CameraControls } from "../model/camera-controls";
import type { CameraInputSurface } from "./camera-input-controller";
import {
  CAMERA_INPUT_TUNING,
  CameraInputController,
} from "./camera-input-controller";

type Listener = (event: unknown) => void;

/** Records listeners so tests can dispatch to them and audit removal. */
class RecordingTarget {
  readonly listeners = new Map<string, Set<Listener>>();
  addCalls = 0;
  removeCalls = 0;

  addEventListener(type: string, listener: unknown): void {
    this.addCalls += 1;
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: unknown): void {
    this.removeCalls += 1;
    this.listeners.get(type)?.delete(listener as Listener);
  }

  dispatch(type: string, event: Record<string, unknown> = {}): void {
    const payload = { preventDefault: () => undefined, target: null, ...event };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(payload);
    }
  }

  totalListeners(): number {
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }
}

class FakeControls implements CameraControls {
  readonly calls: string[] = [];
  rotateLeft(): void {
    this.calls.push("rotateLeft");
  }
  rotateRight(): void {
    this.calls.push("rotateRight");
  }
  zoomBy(factor: number): void {
    this.calls.push(`zoomBy:${factor.toFixed(4)}`);
  }
  panBy(dx: number, dy: number): void {
    this.calls.push(`panBy:${dx.toFixed(1)},${dy.toFixed(1)}`);
  }
}

function setup(): {
  controls: FakeControls;
  controller: CameraInputController;
  element: RecordingTarget;
  doc: RecordingTarget;
} {
  const controls = new FakeControls();
  const controller = new CameraInputController(controls);
  const doc = new RecordingTarget();
  const element = new RecordingTarget();
  const surface = Object.assign(element, {
    ownerDocument: doc,
  }) as unknown as CameraInputSurface;
  controller.attach(surface);
  return { controls, controller, element, doc };
}

describe("CameraInputController", () => {
  it("attach registers wheel on the element and keys on its document", () => {
    const { element, doc, controller } = setup();
    expect(controller.isAttached()).toBe(true);
    expect([...element.listeners.keys()]).toEqual(["wheel"]);
    expect([...doc.listeners.keys()].sort()).toEqual([
      "keydown",
      "keyup",
      "visibilitychange",
    ]);
  });

  it("detach removes every listener it added", () => {
    const { element, doc, controller } = setup();
    controller.detach();
    expect(controller.isAttached()).toBe(false);
    expect(element.totalListeners()).toBe(0);
    expect(doc.totalListeners()).toBe(0);
    expect(element.removeCalls + doc.removeCalls).toBe(
      element.addCalls + doc.addCalls,
    );
  });

  it("detach is idempotent and ignores input afterwards", () => {
    const { controls, controller, doc } = setup();
    controller.detach();
    controller.detach();
    doc.dispatch("keydown", { key: "q", repeat: false });
    expect(controls.calls).toEqual([]);
  });

  it("re-attaching moves the listeners to the new surface", () => {
    const { controller, element, doc } = setup();
    const doc2 = new RecordingTarget();
    const element2 = new RecordingTarget();
    controller.attach(
      Object.assign(element2, {
        ownerDocument: doc2,
      }) as unknown as CameraInputSurface,
    );
    expect(element.totalListeners()).toBe(0);
    expect(doc.totalListeners()).toBe(0);
    expect(element2.totalListeners()).toBe(1);
    expect(doc2.totalListeners()).toBe(3);
  });

  it("Q rotates left and E rotates right, once per press", () => {
    const { controls, doc } = setup();
    doc.dispatch("keydown", { key: "q", repeat: false });
    doc.dispatch("keydown", { key: "q", repeat: true });
    doc.dispatch("keydown", { key: "E", repeat: false });
    expect(controls.calls).toEqual(["rotateLeft", "rotateRight"]);
  });

  it("ignores keys typed into text entry elements", () => {
    const { controls, doc } = setup();
    doc.dispatch("keydown", {
      key: "q",
      repeat: false,
      target: { tagName: "INPUT" },
    });
    doc.dispatch("keydown", {
      key: "e",
      repeat: false,
      target: { tagName: "DIV", isContentEditable: true },
    });
    expect(controls.calls).toEqual([]);
  });

  it("pans while WASD or arrows are held and stops on key-up", () => {
    const { controls, controller, doc } = setup();
    controller.update(0.5);
    expect(controls.calls).toEqual([]);

    doc.dispatch("keydown", { key: "d", repeat: false });
    controller.update(0.5);
    const step = CAMERA_INPUT_TUNING.panSpeedPxPerSecond * 0.5;
    expect(controls.calls).toEqual([`panBy:${step.toFixed(1)},0.0`]);

    doc.dispatch("keyup", { key: "d" });
    doc.dispatch("keydown", { key: "ArrowUp", repeat: false });
    controller.update(0.5);
    expect(controls.calls.at(-1)).toBe(`panBy:0.0,${(-step).toFixed(1)}`);

    doc.dispatch("keyup", { key: "ArrowUp" });
    controller.update(0.5);
    expect(controls.calls).toHaveLength(2);
  });

  it("normalises diagonal panning to the same speed", () => {
    const { controls, controller, doc } = setup();
    doc.dispatch("keydown", { key: "w", repeat: false });
    doc.dispatch("keydown", { key: "d", repeat: false });
    controller.update(1);
    const step = CAMERA_INPUT_TUNING.panSpeedPxPerSecond / Math.SQRT2;
    expect(controls.calls).toEqual([
      `panBy:${step.toFixed(1)},${(-step).toFixed(1)}`,
    ]);
  });

  it("opposite keys cancel out", () => {
    const { controls, controller, doc } = setup();
    doc.dispatch("keydown", { key: "a", repeat: false });
    doc.dispatch("keydown", { key: "d", repeat: false });
    controller.update(1);
    expect(controls.calls).toEqual([]);
  });

  it("drops held keys when the page is hidden", () => {
    const { controls, controller, doc } = setup();
    doc.dispatch("keydown", { key: "s", repeat: false });
    doc.dispatch("visibilitychange");
    controller.update(1);
    expect(controls.calls).toEqual([]);
  });

  it("wheel up zooms in, wheel down zooms out, clamped per event", () => {
    const { controls, element } = setup();
    element.dispatch("wheel", { deltaY: -100, deltaMode: 0 });
    element.dispatch("wheel", { deltaY: 100, deltaMode: 0 });
    element.dispatch("wheel", { deltaY: 100_000, deltaMode: 0 });
    const sensitivity = CAMERA_INPUT_TUNING.wheelZoomSensitivity;
    const maxDelta = CAMERA_INPUT_TUNING.maxWheelDeltaPx;
    expect(controls.calls).toEqual([
      `zoomBy:${Math.exp(100 * sensitivity).toFixed(4)}`,
      `zoomBy:${Math.exp(-100 * sensitivity).toFixed(4)}`,
      `zoomBy:${Math.exp(-maxDelta * sensitivity).toFixed(4)}`,
    ]);
  });

  it("scales line-mode wheel deltas up to pixels", () => {
    const { controls, element } = setup();
    element.dispatch("wheel", { deltaY: -3, deltaMode: 1 });
    const sensitivity = CAMERA_INPUT_TUNING.wheelZoomSensitivity;
    expect(controls.calls).toEqual([
      `zoomBy:${Math.exp(3 * 16 * sensitivity).toFixed(4)}`,
    ]);
  });

  it("ignores a zero wheel delta", () => {
    const { controls, element } = setup();
    element.dispatch("wheel", { deltaY: 0, deltaMode: 0 });
    expect(controls.calls).toEqual([]);
  });
});
