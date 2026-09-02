import type { Camera } from "three";
import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { CityId } from "../../overworld/model/city";
import type { CityPicker } from "../model/city-picker";
import type { SceneCamera } from "../model/scene-camera";
import type { PickingSurface } from "./map-picking-controller";
import {
  MAP_PICKING_TUNING,
  MapPickingController,
} from "./map-picking-controller";

type Listener = (event: unknown) => void;

/** Records listeners so tests can dispatch to them and audit removal. */
class FakeSurface {
  readonly listeners = new Map<string, Set<Listener>>();
  addCalls = 0;
  removeCalls = 0;
  rect = { left: 100, top: 50, width: 800, height: 400 };

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

/** Picks by NDC quadrant: top-left is "london", bottom-right is "sydney". */
class FakePicker implements CityPicker {
  hovered: CityId | undefined;
  selected: CityId | undefined;
  readonly hoverCalls: (CityId | undefined)[] = [];
  readonly positions = new Map<CityId, Vec3>([
    ["london", { x: -1, y: 0, z: 0 }],
    ["sydney", { x: 1, y: 0, z: 0 }],
  ]);

  pickCity(ndc: Vec2, _camera: Camera): CityId | undefined {
    if (ndc.x < 0 && ndc.y > 0) return "london";
    if (ndc.x > 0 && ndc.y < 0) return "sydney";
    return undefined;
  }
  setHovered(cityId: CityId | undefined): void {
    this.hovered = cityId;
    this.hoverCalls.push(cityId);
  }
  setSelected(cityId: CityId | undefined): void {
    this.selected = cityId;
  }
  markerWorldPosition(cityId: CityId): Vec3 | undefined {
    return this.positions.get(cityId);
  }
}

class FakeCamera implements SceneCamera {
  readonly camera = new OrthographicCamera(-2, 2, 1, -1, 0.1, 10);
  constructor() {
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
  resize(): void {
    // The fake never resizes.
  }
  apply(): void {
    // Nothing to sync.
  }
}

function setup(): {
  controller: MapPickingController;
  picker: FakePicker;
  surface: FakeSurface;
  selected: CityId[];
} {
  const picker = new FakePicker();
  const selected: CityId[] = [];
  const controller = new MapPickingController(picker, new FakeCamera(), {
    onCitySelected: (cityId) => selected.push(cityId),
  });
  const surface = new FakeSurface();
  controller.attach(surface.asSurface());
  return { controller, picker, surface, selected };
}

const TOP_LEFT = { clientX: 200, clientY: 100 };
const BOTTOM_RIGHT = { clientX: 800, clientY: 400 };
const CENTRE = { clientX: 500, clientY: 250 };

describe("MapPickingController", () => {
  it("attach registers pointer listeners and detach removes every one", () => {
    const { controller, surface } = setup();
    expect(controller.isAttached()).toBe(true);
    expect([...surface.listeners.keys()].sort()).toEqual([
      "pointerdown",
      "pointerleave",
      "pointermove",
      "pointerup",
    ]);
    controller.detach();
    expect(controller.isAttached()).toBe(false);
    expect(surface.totalListeners()).toBe(0);
    expect(surface.removeCalls).toBe(surface.addCalls);
    controller.detach();
    expect(surface.removeCalls).toBe(surface.addCalls);
  });

  it("highlights the marker under the pointer and only reports changes", () => {
    const { picker, surface } = setup();
    surface.dispatch("pointermove", TOP_LEFT);
    surface.dispatch("pointermove", { clientX: 210, clientY: 110 });
    surface.dispatch("pointermove", CENTRE);
    surface.dispatch("pointermove", BOTTOM_RIGHT);
    expect(picker.hoverCalls).toEqual(["london", undefined, "sydney"]);
  });

  it("clears hover when the pointer leaves and on detach", () => {
    const { controller, picker, surface } = setup();
    surface.dispatch("pointermove", TOP_LEFT);
    surface.dispatch("pointerleave");
    expect(picker.hovered).toBeUndefined();
    surface.dispatch("pointermove", BOTTOM_RIGHT);
    controller.detach();
    expect(picker.hovered).toBeUndefined();
  });

  it("selects on a press and release over a marker", () => {
    const { picker, surface, selected } = setup();
    surface.dispatch("pointerdown", TOP_LEFT);
    surface.dispatch("pointerup", { clientX: 202, clientY: 101 });
    expect(selected).toEqual(["london"]);
    expect(picker.selected).toBe("london");
  });

  it("does not select when the press dragged or missed a marker", () => {
    const { picker, surface, selected } = setup();
    surface.dispatch("pointerdown", TOP_LEFT);
    surface.dispatch("pointerup", {
      clientX: TOP_LEFT.clientX + MAP_PICKING_TUNING.clickSlopPx + 1,
      clientY: TOP_LEFT.clientY,
    });
    surface.dispatch("pointerdown", CENTRE);
    surface.dispatch("pointerup", CENTRE);
    surface.dispatch("pointerup", BOTTOM_RIGHT);
    expect(selected).toEqual([]);
    expect(picker.selected).toBeUndefined();
  });

  it("selectCity marks the scene and reports, without any pointer input", () => {
    const { controller, picker, selected } = setup();
    controller.selectCity("sydney");
    expect(picker.selected).toBe("sydney");
    expect(selected).toEqual(["sydney"]);
  });

  it("projects a marker to client pixels inside the surface rect", () => {
    const { controller, surface } = setup();
    const london = controller.screenPositionOf("london");
    const sydney = controller.screenPositionOf("sydney");
    expect(london).toBeDefined();
    expect(sydney).toBeDefined();
    if (!london || !sydney) throw new Error("unreachable");
    // The camera frustum is 4 wide; x = -1 lands a quarter of the way in.
    const expectedNdcX = new Vector3(-1, 0, 0).project(
      new FakeCamera().camera,
    ).x;
    expect(london.x).toBeCloseTo(
      surface.rect.left + ((expectedNdcX + 1) / 2) * surface.rect.width,
    );
    expect(london.y).toBeCloseTo(surface.rect.top + surface.rect.height / 2);
    expect(sydney.x).toBeGreaterThan(london.x);
    expect(controller.screenPositionOf("atlantis")).toBeUndefined();
    controller.detach();
    expect(controller.screenPositionOf("london")).toBeUndefined();
  });
});
