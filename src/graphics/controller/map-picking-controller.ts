import { Vector3 } from "three";

import type { Vec2 } from "../../core/model/grid";
import type { CityId } from "../../overworld/model/city";
import type { CityPicker } from "../model/city-picker";
import type { SceneCamera } from "../model/scene-camera";
import { ndcToPointer, pointerToNdc } from "../service/pointer-ndc";

// ===========================================
// Types
// ===========================================

/**
 * The DOM surface the controller listens on: the element the map canvas
 * lives in. `HTMLElement` satisfies this directly.
 */
export type PickingSurface = Pick<
  HTMLElement,
  "addEventListener" | "removeEventListener" | "getBoundingClientRect"
>;

/** Callbacks the controller reports through. */
export interface MapPickingOptions {
  /** Called with the city id whenever a city is selected, by click or by `selectCity`. */
  readonly onCitySelected: (cityId: CityId) => void;
}

// ===========================================
// Constants
// ===========================================

/** Pointer tuning. */
export const MAP_PICKING_TUNING = {
  /** A press that moves further than this before release is a drag, not a click. */
  clickSlopPx: 4,
} as const;

// ===========================================
// Controller
// ===========================================

/**
 * Turns pointer input over the map into hover and selection: moving
 * highlights the marker under the pointer, a press-and-release without
 * drag selects it and reports the city id. Depends on the `CityPicker`
 * and `SceneCamera` interfaces, never on the concrete scene or rig.
 *
 * ```
 *   pointermove ──▶ pick ──▶ picker.setHovered
 *   pointerdown ──▶ remember press
 *   pointerup   ──▶ moved ≤ slop? pick ──▶ selectCity ──▶ onCitySelected
 * ```
 */
export class MapPickingController {
  // ===========================================
  // Fields
  // ===========================================

  private readonly picker: CityPicker;
  private readonly camera: SceneCamera;
  private readonly options: MapPickingOptions;
  private surface: PickingSurface | undefined;
  private hovered: CityId | undefined;
  private press: Vec2 | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param picker - Hit-tests and highlights markers; usually the scene builder.
   * @param camera - Owner of the camera the map is seen through.
   * @param options - Where selections are reported.
   */
  constructor(
    picker: CityPicker,
    camera: SceneCamera,
    options: MapPickingOptions,
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

  /**
   * Selects a city as if its marker had been clicked: marks it in the
   * scene and reports it. Also the end-to-end test hook.
   */
  selectCity(cityId: CityId): void {
    this.picker.setSelected(cityId);
    this.options.onCitySelected(cityId);
  }

  /**
   * Where a city's marker currently appears, in client pixels, or
   * `undefined` when detached or the city is unknown. Lets tests click
   * a real marker and lets UI anchor labels to markers.
   */
  screenPositionOf(cityId: CityId): Vec2 | undefined {
    const world = this.picker.markerWorldPosition(cityId);
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

  /** Highlights whatever marker is under the pointer. */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.setHovered(this.pickAt(event));
  };

  /** Remembers where a press started so a drag can be told from a click. */
  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.press = { x: event.clientX, y: event.clientY };
  };

  /** Selects the marker under a release that did not drag. */
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
    const cityId = this.pickAt(event);
    if (cityId !== undefined) {
      this.selectCity(cityId);
    }
  };

  /** Clears hover and any pending press when the pointer leaves the surface. */
  private readonly handlePointerLeave = (): void => {
    this.setHovered(undefined);
    this.press = undefined;
  };

  /** Raycasts the marker under a pointer event. */
  private pickAt(
    event: Pick<PointerEvent, "clientX" | "clientY">,
  ): CityId | undefined {
    if (!this.surface) {
      return undefined;
    }
    const ndc = pointerToNdc(
      this.surface.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
    return this.picker.pickCity(ndc, this.camera.camera);
  }

  /** Pushes a hover change to the picker only when it actually changed. */
  private setHovered(cityId: CityId | undefined): void {
    if (cityId === this.hovered) {
      return;
    }
    this.hovered = cityId;
    this.picker.setHovered(cityId);
  }
}
