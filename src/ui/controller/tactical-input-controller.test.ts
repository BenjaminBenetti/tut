import type { Camera } from "three";
import { OrthographicCamera } from "three";
import { describe, expect, it } from "vitest";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { CameraInputSurface } from "../../graphics/controller/camera-input-controller";
import { PICKING_TUNING } from "../../graphics/controller/picking-controller";
import type { SceneCamera } from "../../graphics/model/scene-camera";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalIntent } from "../model/tactical-intent";
import { ACTION_BAR_ORDER } from "../model/tactical-intent";
import type {
  CameraInput,
  TacticalInputSurface,
  TacticalPicker,
} from "./tactical-input-controller";
import {
  TACTICAL_SHORTCUTS,
  TacticalInputController,
} from "./tactical-input-controller";

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

/**
 * Left third: unit "u1"; middle: tile (2,0,2); the band just right of it
 * (ndc 0.4-0.7): egg spawner "spawner-1"; far right: nothing.
 */
class FakePicker implements TacticalPicker {
  hovered: string | undefined;
  selected: string | undefined;
  hoveredSpawner: string | undefined;
  selectedSpawner: string | undefined;
  readonly hoverCalls: (string | undefined)[] = [];
  readonly spawnerHoverCalls: (string | undefined)[] = [];
  pickUnit(ndc: Vec2, _camera: Camera): string | undefined {
    return ndc.x < -0.33 ? "u1" : undefined;
  }
  pickTile(ndc: Vec2, _camera: Camera): TileCoord | undefined {
    return ndc.x >= -0.33 && ndc.x <= 0.33 ? { x: 2, y: 0, z: 2 } : undefined;
  }
  pickSpawner(ndc: Vec2, _camera: Camera): string | undefined {
    return ndc.x > 0.4 && ndc.x < 0.7 ? "spawner-1" : undefined;
  }
  setHovered(id: string | undefined): void {
    this.hovered = id;
    this.hoverCalls.push(id);
  }
  setSelected(id: string | undefined): void {
    this.selected = id;
  }
  setHoveredSpawner(id: string | undefined): void {
    this.hoveredSpawner = id;
    this.spawnerHoverCalls.push(id);
  }
  setSelectedSpawner(id: string | undefined): void {
    this.selectedSpawner = id;
  }
  spawnerWorldPosition(id: string): Vec3 | undefined {
    return id === "spawner-1" ? { x: 2, y: 0, z: 2 } : undefined;
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
    key("t");
    key("v");
    key("x");
    key("i");
    key("z");
    key("a", { repeat: true });
    key("r", { target: { tagName: "INPUT" } });
    expect(intents).toEqual([
      { kind: "action", action: "move" },
      { kind: "end-turn" },
      { kind: "action", action: "next-unit" },
      { kind: "action", action: "cancel" },
      { kind: "action", action: "next-target" },
      { kind: "action", action: "toggle-range" },
      { kind: "action", action: "extract" },
      { kind: "action", action: "interact" },
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

  it("picks an egg spawner, highlights it and reports a select-spawner intent (#484)", () => {
    const { surface, intents, picker } = setup();
    // A click in the spawner band: hover marks it, release reports it.
    surface.dispatch("pointermove", { clientX: 300, clientY: 200 });
    expect(picker.hoveredSpawner).toBe("spawner-1");
    expect(picker.hovered).toBeUndefined();
    surface.dispatch("pointerdown", { clientX: 300, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 300, clientY: 200 });
    expect(intents).toContainEqual({
      kind: "select-spawner",
      spawnerId: "spawner-1",
    });
    expect(picker.selectedSpawner).toBe("spawner-1");
  });

  it("a unit under the pointer wins over a spawner, so a bug on its hive stays clickable", () => {
    const { surface, intents, picker } = setup();
    // The left third answers for both a unit and (were it asked) nothing else.
    surface.dispatch("pointerdown", { clientX: 20, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 20, clientY: 200 });
    expect(intents).toContainEqual({ kind: "select-unit", unitId: "u1" });
    expect(picker.selectedSpawner).toBeUndefined();
  });

  it("clears the spawner highlight when the pointer leaves it", () => {
    const { surface, picker } = setup();
    surface.dispatch("pointermove", { clientX: 300, clientY: 200 });
    expect(picker.hoveredSpawner).toBe("spawner-1");
    surface.dispatch("pointermove", { clientX: 200, clientY: 200 });
    expect(picker.hoveredSpawner).toBeUndefined();
    // Only changes are pushed through, not every move.
    expect(picker.spawnerHoverCalls).toEqual(["spawner-1", undefined]);
  });

  it("exposes spawner hooks that select and project like the unit ones", () => {
    const { controller, intents, picker } = setup();
    const hooks = controller.hooks();
    hooks.selectSpawner("spawner-1");
    expect(intents).toContainEqual({
      kind: "select-spawner",
      spawnerId: "spawner-1",
    });
    expect(picker.selectedSpawner).toBe("spawner-1");
    expect(hooks.spawnerScreenPosition("spawner-1")).toBeDefined();
    expect(hooks.spawnerScreenPosition("nobody")).toBeUndefined();
  });
});

// ===========================================
// Right click invokes, number keys arm (#520)
// ===========================================

describe("TacticalInputController pointer buttons", () => {
  /** A press and release of one button at a client position. */
  function click(
    surface: ReturnType<typeof setup>["surface"],
    button: number,
    clientX: number,
  ): void {
    surface.dispatch("pointerdown", { clientX, clientY: 200, button });
    surface.dispatch("pointerup", { clientX, clientY: 200, button });
  }

  it("left click selects and never invokes", () => {
    const { intents, surface } = setup();
    click(surface, 0, 20);
    click(surface, 0, 200);
    expect(intents).toEqual([
      { kind: "select-unit", unitId: "u1" },
      { kind: "select-tile", tile: { x: 2, y: 0, z: 2 } },
    ]);
  });

  it("right click invokes at the cursor and selects nothing", () => {
    const { intents, picker, surface } = setup();
    click(surface, 2, 200);
    expect(intents).toEqual([
      { kind: "invoke", target: { kind: "tile", tile: { x: 2, y: 0, z: 2 } } },
    ]);
    // Invoking must not move the selection highlight.
    expect(picker.selected).toBeUndefined();
  });

  it("right click invokes on a unit and on an egg spawner too", () => {
    const { intents, surface } = setup();
    click(surface, 2, 20);
    click(surface, 2, 320);
    expect(intents).toEqual([
      { kind: "invoke", target: { kind: "unit", unitId: "u1" } },
      { kind: "invoke", target: { kind: "spawner", spawnerId: "spawner-1" } },
    ]);
  });

  it("a right drag invokes nothing, like a left drag selects nothing", () => {
    const { intents, surface } = setup();
    surface.dispatch("pointerdown", { clientX: 200, clientY: 200, button: 2 });
    surface.dispatch("pointerup", {
      clientX: 200 + PICKING_TUNING.clickSlopPx + 5,
      clientY: 200,
      button: 2,
    });
    expect(intents).toEqual([]);
  });

  it("suppresses the browser menu on the viewport, and only while attached", () => {
    const { controller, surface } = setup();
    let prevented = 0;
    surface.dispatch("contextmenu", {
      preventDefault: () => {
        prevented += 1;
      },
    });
    expect(prevented).toBe(1);
    // The listener is on the surface, not the document, so the rest of
    // the app keeps its right-click menu.
    expect(surface.ownerDocument.listeners.get("contextmenu")).toBeUndefined();
    controller.detach();
    surface.dispatch("contextmenu", {
      preventDefault: () => {
        prevented += 1;
      },
    });
    expect(prevented).toBe(1);
  });

  it("binds the number row to the action bar in order", () => {
    const { intents, surface } = setup();
    for (const key of ["1", "2", "3", "4", "5", "6", "7"]) {
      surface.ownerDocument.dispatch("keydown", {
        key,
        preventDefault: () => undefined,
      });
    }
    expect(intents).toEqual([
      { kind: "action", action: "move" },
      { kind: "action", action: "attack" },
      { kind: "action", action: "overwatch" },
      { kind: "action", action: "reload" },
      { kind: "action", action: "interact" },
      { kind: "action", action: "extract" },
      // The bar's last button is End turn, so its digit is End Turn.
      { kind: "end-turn" },
    ]);
  });

  it("keeps every letter shortcut from #340 working alongside the digits", () => {
    const { intents, surface } = setup();
    for (const key of ["m", "a", "o", "r", "i", "x", "enter"]) {
      surface.ownerDocument.dispatch("keydown", {
        key,
        preventDefault: () => undefined,
      });
    }
    expect(
      intents.map((i) => (i.kind === "action" ? i.action : i.kind)),
    ).toEqual([
      "move",
      "attack",
      "overwatch",
      "reload",
      "interact",
      "extract",
      "end-turn",
    ]);
  });

  it("has one digit per action-bar button, with no gaps", () => {
    const digits = Object.keys(TACTICAL_SHORTCUTS).filter((key) =>
      /^[0-9]$/.test(key),
    );
    expect(digits.sort()).toEqual(
      ACTION_BAR_ORDER.map((_, i) => String(i + 1)).sort(),
    );
  });
});
