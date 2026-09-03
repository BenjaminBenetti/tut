import type { Camera } from "three";
import { OrthographicCamera } from "three";
import { describe, expect, it } from "vitest";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { CameraInputSurface } from "../../graphics/controller/camera-input-controller";
import { PICKING_TUNING } from "../../graphics/controller/picking-controller";
import type { SceneCamera } from "../../graphics/model/scene-camera";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalIntent } from "../model/tactical-intent";
import type {
  CameraInput,
  TacticalInputSurface,
  TacticalPicker,
} from "./tactical-input-controller";
import { TacticalInputController } from "./tactical-input-controller";

type Listener = (event: unknown) => void;

/** Records listeners on itself and on a fake document. */
class FakeSurface {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly ownerDocument = new FakeTarget();
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
    for (const set of this.listeners.values()) total += set.size;
    return total + this.ownerDocument.totalListeners();
  }
  asSurface(): TacticalInputSurface {
    return this as unknown as TacticalInputSurface;
  }
}

class FakeTarget {
  readonly listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, listener: unknown): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: unknown): void {
    this.listeners.get(type)?.delete(listener as Listener);
  }
  dispatch(type: string, event: Record<string, unknown> = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  totalListeners(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

/** Left third: unit "u1"; middle: tile (2,0,2); right third: nothing. */
class FakePicker implements TacticalPicker {
  hovered: string | undefined;
  selected: string | undefined;
  readonly hoverCalls: (string | undefined)[] = [];
  pickUnit(ndc: Vec2, _camera: Camera): string | undefined {
    return ndc.x < -0.33 ? "u1" : undefined;
  }
  pickTile(ndc: Vec2, _camera: Camera): TileCoord | undefined {
    return ndc.x >= -0.33 && ndc.x <= 0.33 ? { x: 2, y: 0, z: 2 } : undefined;
  }
  setHovered(id: string | undefined): void {
    this.hovered = id;
    this.hoverCalls.push(id);
  }
  setSelected(id: string | undefined): void {
    this.selected = id;
  }
  unitWorldPosition(id: string): Vec3 | undefined {
    return id === "u1" ? { x: -1, y: 0, z: 0 } : undefined;
  }
  tileWorldPosition(tile: TileCoord): Vec3 | undefined {
    return tile.x === 2 ? { x: 1, y: 0, z: 0 } : undefined;
  }
}

class FakeCameraInput implements CameraInput {
  attached: CameraInputSurface | undefined;
  updates = 0;
  attach(surface: CameraInputSurface): void {
    this.attached = surface;
  }
  detach(): void {
    this.attached = undefined;
  }
  update(): void {
    this.updates += 1;
  }
}

const sceneCamera = (): SceneCamera => {
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 10);
  camera.position.set(0, 5, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return { camera, resize: () => undefined, apply: () => undefined };
};

function setup() {
  const picker = new FakePicker();
  const cameraInput = new FakeCameraInput();
  const intents: TacticalIntent[] = [];
  const controller = new TacticalInputController({
    picker,
    camera: sceneCamera(),
    cameraInput,
    intents: { emit: (intent) => intents.push(intent) },
  });
  const surface = new FakeSurface();
  controller.attach(surface.asSurface());
  return { picker, cameraInput, intents, controller, surface };
}

describe("TacticalInputController", () => {
  it("attaches the camera input with itself and detaches everything", () => {
    const { controller, cameraInput, surface } = setup();
    expect(cameraInput.attached).toBeDefined();
    expect(controller.isAttached()).toBe(true);
    controller.update(0.016);
    expect(cameraInput.updates).toBe(1);
    controller.detach();
    expect(cameraInput.attached).toBeUndefined();
    expect(surface.totalListeners()).toBe(0);
    expect(controller.isAttached()).toBe(false);
  });

  it("hovers the unit under the pointer, else remembers the tile", () => {
    const { controller, picker, surface } = setup();
    surface.dispatch("pointermove", { clientX: 20, clientY: 200 });
    expect(picker.hovered).toBe("u1");
    expect(controller.getHoveredTile()).toBeUndefined();
    surface.dispatch("pointermove", { clientX: 200, clientY: 200 });
    expect(picker.hovered).toBeUndefined();
    expect(controller.getHoveredTile()).toEqual({ x: 2, y: 0, z: 2 });
    surface.dispatch("pointerleave");
    expect(controller.getHoveredTile()).toBeUndefined();
    expect(picker.hoverCalls).toEqual(["u1", undefined]);
  });

  it("clicks select a unit or a tile, drags select nothing", () => {
    const { intents, picker, surface } = setup();
    surface.dispatch("pointerdown", { clientX: 20, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 21, clientY: 200 });
    surface.dispatch("pointerdown", { clientX: 200, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 200, clientY: 201 });
    surface.dispatch("pointerdown", { clientX: 380, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 380, clientY: 200 });
    surface.dispatch("pointerdown", { clientX: 20, clientY: 200 });
    surface.dispatch("pointerup", {
      clientX: 20 + PICKING_TUNING.clickSlopPx + 1,
      clientY: 200,
    });
    expect(intents).toEqual([
      { kind: "select-unit", unitId: "u1" },
      { kind: "select-tile", tile: { x: 2, y: 0, z: 2 } },
    ]);
    expect(picker.selected).toBe("u1");
  });

  it("maps shortcut keys to actions and End Turn, ignoring repeats and typing", () => {
    const { intents, surface } = setup();
    const doc = surface.ownerDocument;
    const key = (k: string, extra: Record<string, unknown> = {}) =>
      doc.dispatch("keydown", {
        key: k,
        repeat: false,
        preventDefault: () => undefined,
        target: null,
        ...extra,
      });
    key("m");
    key("Enter");
    key("Tab");
    key("Escape");
    key("x");
    key("a", { repeat: true });
    key("r", { target: { tagName: "INPUT" } });
    expect(intents).toEqual([
      { kind: "action", action: "move" },
      { kind: "end-turn" },
      { kind: "action", action: "next-unit" },
      { kind: "action", action: "cancel" },
    ]);
  });

  it("exposes hooks that select and project through the live camera", () => {
    const { controller, intents, picker } = setup();
    const hooks = controller.hooks();
    hooks.selectUnit("u1");
    hooks.selectTile({ x: 2, y: 0, z: 2 });
    expect(intents.map((i) => i.kind)).toEqual(["select-unit", "select-tile"]);
    expect(picker.selected).toBe("u1");
    const unitAt = hooks.unitScreenPosition("u1");
    const tileAt = hooks.tileScreenPosition({ x: 2, y: 0, z: 2 });
    expect(unitAt?.x).toBeLessThan(200);
    expect(tileAt?.x).toBeGreaterThan(200);
    expect(hooks.unitScreenPosition("ghost")).toBeUndefined();
    expect(hooks.tileScreenPosition({ x: 9, y: 0, z: 9 })).toBeUndefined();
  });
});
