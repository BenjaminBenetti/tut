import type { Camera } from "three";
import { Vector3 } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { SceneCamera } from "../model/scene-camera";
import { ndcToPointer, pointerToNdc } from "../service/pointer-ndc";
import type { PickingSurface } from "./map-picking-controller";
import { MAP_PICKING_TUNING } from "./map-picking-controller";

// ===========================================
// Types
// ===========================================

/** What the controller needs from a scene to hover and select things of one kind. */
export interface Picker<TId> {
  /** The thing under a normalised device coordinate, or undefined. */
  pick(ndc: Vec2, camera: Camera): TId | undefined;
  /** Highlights one thing as hovered, or none. */
  setHovered(id: TId | undefined): void;
  /** Marks one thing as selected, or none. */
  setSelected(id: TId | undefined): void;
  /** A world point on the thing, or undefined when unknown. */
  worldPosition(id: TId): Vec3 | undefined;
}

/** Callbacks the controller reports through. */
export interface PickingOptions<TId> {
  /** Called whenever something is selected, by click or by `select`. */
  readonly onSelected: (id: TId) => void;
}

// ===========================================
// Controller
// ===========================================

/**
 * Pointer input over a scene turned into hover and selection for any
 * kind of pickable thing: moving highlights what is under the pointer, a
 * press-and-release without drag selects it. The generic sibling of
 * `MapPickingController`, which stays city-shaped for the overworld; the
 * tactical scene wraps its `UnitPicker` in a `Picker<UnitId>` and uses
 * this.
 *
 * ```
 *   pointermove ──▶ pick ──▶ picker.setHovered
 *   pointerdown ──▶ remember press
 *   pointerup   ──▶ moved ≤ slop? pick ──▶ select ──▶ onSelected
 * ```
 */
export class PickingController<TId> {
  // ===========================================
  // Fields
  // ===========================================

  private readonly picker: Picker<TId>;
  private readonly camera: SceneCamera;
  private readonly options: PickingOptions<TId>;
  private surface: PickingSurface | undefined;
  private hovered: TId | undefined;
  private press: Vec2 | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param picker - Hit-tests and highlights; usually the scene builder.
   * @param camera - Owner of the camera the scene is seen through.
   * @param options - Where selections are reported.
   */
  constructor(
    picker: Picker<TId>,
    camera: SceneCamera,
    options: PickingOptions<TId>,
  ) {
    this.picker = picker;
    this.camera = camera;
    this.options = options;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Starts listening. Attaching while attached detaches first. */
  attach(surface: PickingSurface): void {
    if (this.surface) {
      this.detach();
    }
    this.surface = surface;
    surface.addEventListener("pointermove", this.handlePointerMove);
    surface.addEventListener("pointerdown", this.handlePointerDown);
    surface.addEventListener("pointerup", this.handlePointerUp);
    surface.addEventListener("pointerleave", this.handlePointerLeave);
  }

  /** Stops listening, removes every listener added by `attach`, and clears hover. */
  detach(): void {
    const surface = this.surface;
    if (!surface) {
      return;
    }
    surface.removeEventListener("pointermove", this.handlePointerMove);
    surface.removeEventListener("pointerdown", this.handlePointerDown);
    surface.removeEventListener("pointerup", this.handlePointerUp);
    surface.removeEventListener("pointerleave", this.handlePointerLeave);
    this.setHovered(undefined);
    this.press = undefined;
    this.surface = undefined;
  }

  /** True while listeners are registered. */
  isAttached(): boolean {
    return this.surface !== undefined;
  }

  /** Selects as if clicked: marks it in the scene and reports it. Also the test hook. */
  select(id: TId): void {
    this.picker.setSelected(id);
    this.options.onSelected(id);
  }

  /** Where something currently appears, in client pixels, or undefined when detached or unknown. */
  screenPositionOf(id: TId): Vec2 | undefined {
    const world = this.picker.worldPosition(id);
    if (!this.surface || !world) {
      return undefined;
    }
    const ndc = new Vector3(world.x, world.y, world.z).project(
      this.camera.camera,
    );
    return ndcToPointer(this.surface.getBoundingClientRect(), {
      x: ndc.x,
      y: ndc.y,
    });
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Highlights whatever is under the pointer. */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.setHovered(this.pickAt(event));
  };

  /** Remembers where a press started so a drag can be told from a click. */
  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.press = { x: event.clientX, y: event.clientY };
  };

  /** Selects what is under a release that did not drag. */
  private readonly handlePointerUp = (event: PointerEvent): void => {
    const press = this.press;
    this.press = undefined;
    if (!press) {
      return;
    }
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > MAP_PICKING_TUNING.clickSlopPx) {
      return;
    }
    const id = this.pickAt(event);
    if (id !== undefined) {
      this.select(id);
    }
  };

  /** Clears hover and any pending press when the pointer leaves the surface. */
  private readonly handlePointerLeave = (): void => {
    this.setHovered(undefined);
    this.press = undefined;
  };

  /** Raycasts under a pointer event. */
  private pickAt(
    event: Pick<PointerEvent, "clientX" | "clientY">,
  ): TId | undefined {
    if (!this.surface) {
      return undefined;
    }
    const ndc = pointerToNdc(
      this.surface.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
    return this.picker.pick(ndc, this.camera.camera);
  }

  /** Pushes a hover change to the picker only when it actually changed. */
  private setHovered(id: TId | undefined): void {
    if (id === this.hovered) {
      return;
    }
    this.hovered = id;
    this.picker.setHovered(id);
  }
}

// ===========================================
// Adapters
// ===========================================

/** The `UnitPicker` shape, generic over the id so the adapter stays free of tactical imports. */
export interface UnitPickerLike<TId> {
  /** The unit under a normalised device coordinate, or undefined. */
  pickUnit(ndc: Vec2, camera: Camera): TId | undefined;
  /** Highlights one unit as hovered, or none. */
  setHovered(id: TId | undefined): void;
  /** Marks one unit as selected, or none. */
  setSelected(id: TId | undefined): void;
  /** A world point at a unit's feet, or undefined when unknown. */
  unitWorldPosition(id: TId): Vec3 | undefined;
}

/** Adapts a `UnitPicker` to the generic `Picker` contract. */
export function unitPickerAdapter<TId>(
  picker: UnitPickerLike<TId>,
): Picker<TId> {
  return {
    pick: (ndc, camera) => picker.pickUnit(ndc, camera),
    setHovered: (id) => {
      picker.setHovered(id);
    },
    setSelected: (id) => {
      picker.setSelected(id);
    },
    worldPosition: (id) => picker.unitWorldPosition(id),
  };
}
