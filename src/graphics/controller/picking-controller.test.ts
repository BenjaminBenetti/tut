import type { Camera } from "three";
import { OrthographicCamera } from "three";
import { describe, expect, it } from "vitest";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { SceneCamera } from "../model/scene-camera";
import type { CityId } from "../../overworld/model/city";
import type { CityPicker } from "../model/city-picker";
import type { InstallationPicker } from "../model/installation-picker";
import type { OverworldPick } from "../model/overworld-pick";
import {
  cityPick,
  installationPick,
  regionPick,
} from "../model/overworld-pick";
import type { RegionPicker } from "../model/region-picker";
import type { Picker, PickingSurface } from "./picking-controller";
import {
  cityPickerAdapter,
  overworldPickerAdapter,
  PICKING_TUNING,
  PickingController,
  unitPickerAdapter,
} from "./picking-controller";

type Listener = (event: unknown) => void;

/** Records listeners so tests can dispatch to them and audit removal. */
class FakeSurface {
  readonly listeners = new Map<string, Set<Listener>>();
  rect = { left: 0, top: 0, width: 400, height: 400 };
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

/**
 * An overworld scene as the composite adapter sees it: a city on the
 * left third, its region's land across the left half, sea to the right.
 */
class FakeOverworldScene
  implements CityPicker, InstallationPicker, RegionPicker
{
  readonly calls: string[] = [];
  pickCity(ndc: Vec2, _camera: Camera): CityId | undefined {
    return ndc.x < -0.5 ? "london" : undefined;
  }
  /** Stands between London and the open land, so the order of the asks shows. */
  pickInstallation(ndc: Vec2, _camera: Camera): string | undefined {
    return ndc.x < -0.3 ? "deployable-1" : undefined;
  }
  pickRegion(ndc: Vec2, _camera: Camera): string | undefined {
    return ndc.x < 0 ? "western-europe" : undefined;
  }
  setHoveredInstallation(id: string | undefined): void {
    this.calls.push(`hover-installation:${id ?? "none"}`);
  }
  setSelectedInstallation(id: string | undefined): void {
    this.calls.push(`select-installation:${id ?? "none"}`);
  }
  installationWorldPosition(id: string): Vec3 | undefined {
    return id === "deployable-1" ? { x: 3, y: 0, z: 4 } : undefined;
  }
  setHovered(id: CityId | undefined): void {
    this.calls.push(`hover-city:${id ?? "none"}`);
  }
  setSelected(id: CityId | undefined): void {
    this.calls.push(`select-city:${id ?? "none"}`);
  }
  setHoveredRegion(id: string | undefined): void {
    this.calls.push(`hover-region:${id ?? "none"}`);
  }
  setSelectedRegion(id: string | undefined): void {
    this.calls.push(`select-region:${id ?? "none"}`);
  }
  markerWorldPosition(id: CityId): Vec3 | undefined {
    return id === "london" ? { x: 1, y: 0, z: 2 } : undefined;
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
      clientX: 20 + PICKING_TUNING.clickSlopPx + 1,
      clientY: 200,
    });
    expect(selected).toEqual([]);
    surface.dispatch("pointerdown", { clientX: 380, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 381, clientY: 200 });
    expect(selected).toEqual(["right"]);
    expect(picker.selected).toBe("right");
  });

  it("a click neither selects nor invokes while the scene says it is locked, and hover goes on (#1130)", () => {
    const picker = new FakePicker();
    const selected: string[] = [];
    const invoked: string[] = [];
    let locked = true;
    const controller = new PickingController(picker, sceneCamera(), {
      onSelected: (id) => selected.push(id),
      onInvoked: (id) => invoked.push(id),
      isLocked: () => locked,
    });
    const surface = new FakeSurface();
    controller.attach(surface.asSurface());
    surface.dispatch("pointerdown", { clientX: 20, clientY: 200, button: 0 });
    surface.dispatch("pointerup", { clientX: 20, clientY: 200, button: 0 });
    surface.dispatch("pointerdown", { clientX: 380, clientY: 200, button: 2 });
    surface.dispatch("pointerup", { clientX: 380, clientY: 200, button: 2 });
    surface.dispatch("pointermove", { clientX: 380, clientY: 200 });
    expect(selected).toEqual([]);
    expect(invoked).toEqual([]);
    expect(picker.selected).toBeUndefined();
    expect(picker.hovered).toBe("right");
    locked = false;
    surface.dispatch("pointerdown", { clientX: 20, clientY: 200, button: 0 });
    surface.dispatch("pointerup", { clientX: 20, clientY: 200, button: 0 });
    expect(selected).toEqual(["left"]);
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

  it("registers the four pointer listeners and removes every one, idempotently", () => {
    const controller = new PickingController(new FakePicker(), sceneCamera(), {
      onSelected: () => undefined,
    });
    const surface = new FakeSurface();
    controller.attach(surface.asSurface());
    expect([...surface.listeners.keys()].sort()).toEqual([
      "pointerdown",
      "pointerleave",
      "pointermove",
      "pointerup",
    ]);
    controller.detach();
    expect(surface.removeCalls).toBe(surface.addCalls);
    controller.detach();
    expect(surface.removeCalls).toBe(surface.addCalls);
  });

  it("clears hover on pointer leave and does not select a release with no press or a miss", () => {
    const picker = new FakePicker();
    const selected: string[] = [];
    const controller = new PickingController(picker, sceneCamera(), {
      onSelected: (id) => selected.push(id),
    });
    const surface = new FakeSurface();
    controller.attach(surface.asSurface());
    surface.dispatch("pointermove", { clientX: 20, clientY: 200 });
    surface.dispatch("pointerleave");
    expect(picker.hovered).toBeUndefined();
    surface.dispatch("pointerup", { clientX: 20, clientY: 200 });
    surface.dispatch("pointerdown", { clientX: 200, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 200, clientY: 200 });
    expect(selected).toEqual([]);
    expect(picker.selected).toBeUndefined();
  });

  it("projects inside the surface rect through the camera", () => {
    const picker = new FakePicker();
    const controller = new PickingController(picker, sceneCamera(), {
      onSelected: () => undefined,
    });
    const surface = new FakeSurface();
    surface.rect = { left: 100, top: 50, width: 800, height: 400 };
    controller.attach(surface.asSurface());
    const at = controller.screenPositionOf("left");
    expect(at).toBeDefined();
    if (!at) throw new Error("unreachable");
    // x = −1 in a 4-wide frustum lands a quarter of the way across.
    expect(at.x).toBeCloseTo(surface.rect.left + surface.rect.width / 4);
    expect(at.y).toBeCloseTo(surface.rect.top + surface.rect.height / 2, 0);
  });

  it("picks a city over an installation, an installation over its region's land, the land over the sea, and reports a sea click as a miss (#1155)", () => {
    const scene = new FakeOverworldScene();
    const adapted = overworldPickerAdapter(scene);
    const camera = sceneCamera().camera;
    expect(adapted.pick({ x: -0.8, y: 0 }, camera)).toEqual(cityPick("london"));
    expect(adapted.pick({ x: -0.4, y: 0 }, camera)).toEqual(
      installationPick("deployable-1"),
    );
    expect(adapted.pick({ x: -0.2, y: 0 }, camera)).toEqual(
      regionPick("western-europe"),
    );
    expect(adapted.pick({ x: 0.5, y: 0 }, camera)).toBeUndefined();

    const selected: OverworldPick[] = [];
    let missed = 0;
    const controller = new PickingController(adapted, sceneCamera(), {
      onSelected: (pick) => selected.push(pick),
      onMissed: () => {
        missed += 1;
      },
    });
    const surface = new FakeSurface();
    controller.attach(surface.asSurface());
    // Land: the region alone is selected, the city and installation cleared.
    surface.dispatch("pointerdown", { clientX: 160, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 160, clientY: 200 });
    expect(selected).toEqual([regionPick("western-europe")]);
    expect(scene.calls.slice(-3)).toEqual([
      "select-city:none",
      "select-installation:none",
      "select-region:western-europe",
    ]);
    // City: the city is selected, the rest cleared.
    surface.dispatch("pointerdown", { clientX: 20, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 20, clientY: 200 });
    expect(selected).toEqual([
      regionPick("western-europe"),
      cityPick("london"),
    ]);
    expect(scene.calls.slice(-3)).toEqual([
      "select-city:london",
      "select-installation:none",
      "select-region:none",
    ]);
    // Installation: it is selected, the city and bare region cleared.
    surface.dispatch("pointerdown", { clientX: 120, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 120, clientY: 200 });
    expect(selected.at(-1)).toEqual(installationPick("deployable-1"));
    expect(scene.calls.slice(-3)).toEqual([
      "select-city:none",
      "select-installation:deployable-1",
      "select-region:none",
    ]);
    // Sea: nothing selected, the miss reported; a drag there is neither.
    surface.dispatch("pointerdown", { clientX: 300, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 300, clientY: 200 });
    expect(missed).toBe(1);
    surface.dispatch("pointerdown", { clientX: 300, clientY: 200 });
    surface.dispatch("pointerup", { clientX: 340, clientY: 200 });
    expect(missed).toBe(1);
    expect(selected).toHaveLength(3);
    expect(controller.screenPositionOf(cityPick("london"))).toBeDefined();
    expect(
      controller.screenPositionOf(installationPick("deployable-1")),
    ).toBeDefined();
    expect(
      controller.screenPositionOf(regionPick("western-europe")),
    ).toBeUndefined();
  });

  it("re-applies hover only when the pick names something else, comparing picks by value (#1155)", () => {
    const scene = new FakeOverworldScene();
    const controller = new PickingController(
      overworldPickerAdapter(scene),
      sceneCamera(),
      { onSelected: () => undefined },
    );
    const surface = new FakeSurface();
    controller.attach(surface.asSurface());
    surface.dispatch("pointermove", { clientX: 160, clientY: 200 });
    surface.dispatch("pointermove", { clientX: 170, clientY: 200 });
    surface.dispatch("pointermove", { clientX: 120, clientY: 200 });
    surface.dispatch("pointermove", { clientX: 20, clientY: 200 });
    surface.dispatch("pointermove", { clientX: 300, clientY: 200 });
    expect(scene.calls).toEqual([
      "hover-city:none",
      "hover-installation:none",
      "hover-region:western-europe",
      "hover-city:none",
      "hover-installation:deployable-1",
      "hover-region:none",
      "hover-city:london",
      "hover-installation:none",
      "hover-region:none",
      "hover-city:none",
      "hover-installation:none",
      "hover-region:none",
    ]);
  });

  it("adapts the overworld's city picker to the generic contract", () => {
    const calls: string[] = [];
    const cityPicker: CityPicker = {
      pickCity: () => "london",
      setHovered: (id: CityId | undefined) =>
        calls.push(`hover:${id ?? "none"}`),
      setSelected: (id: CityId | undefined) =>
        calls.push(`select:${id ?? "none"}`),
      markerWorldPosition: (id: CityId) =>
        id === "london" ? { x: 1, y: 0, z: 2 } : undefined,
    };
    const adapted = cityPickerAdapter(cityPicker);
    expect(adapted.pick({ x: 0, y: 0 }, sceneCamera().camera)).toBe("london");
    adapted.setHovered("london");
    adapted.setSelected(undefined);
    expect(calls).toEqual(["hover:london", "select:none"]);
    expect(adapted.worldPosition("london")).toEqual({ x: 1, y: 0, z: 2 });
    expect(adapted.worldPosition("sydney")).toBeUndefined();
  });
});
