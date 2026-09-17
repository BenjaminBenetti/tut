import type { Camera } from "three";
import { Vector3 } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { CityId } from "../../overworld/model/city";
import type { CityPicker } from "../model/city-picker";
import type { InstallationPicker } from "../model/installation-picker";
import type { OverworldPick } from "../model/overworld-pick";
import {
  cityPick,
  installationPick,
  regionPick,
  samePick,
} from "../model/overworld-pick";
import type { RegionPicker } from "../model/region-picker";
import type { SceneCamera } from "../model/scene-camera";
import { ndcToPointer, pointerToNdc } from "../service/pointer-ndc";

// ===========================================
// Types
// ===========================================

/**
 * The DOM surface the controller listens on: the element the canvas
 * lives in. `HTMLElement` satisfies this directly.
 */
export type PickingSurface = Pick<
  HTMLElement,
  "addEventListener" | "removeEventListener" | "getBoundingClientRect"
>;

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
  /**
   * Whether two ids name the same thing, for ids that are not plain
   * values. Hover is re-applied only when this says the thing changed;
   * pickers that leave it out are compared with `===`.
   */
  sameId?(a: TId, b: TId): boolean;
}

/** Callbacks the controller reports through. */
export interface PickingOptions<TId> {
  /** Called whenever something is selected, by click or by `select`. */
  readonly onSelected: (id: TId) => void;
  /**
   * When given, a release of the secondary button reports here instead
   * of selecting: the tactical screen invokes the armed action there
   * (#520). Scenes that omit it keep selecting on any button.
   */
  readonly onInvoked?: (id: TId) => void;
  /**
   * When given and answering true, a click selects and invokes nothing
   * (#1130): the tactical screen holds the map while a bug phase plays.
   * Hover still highlights, so the pointer is not dead, only the press.
   */
  readonly isLocked?: () => boolean;
  /**
   * When given, a click that lands on nothing reports here (#1155):
   * the overworld clears its selection on a click at sea. Scenes that
   * omit it ignore such clicks, as they always have.
   */
  readonly onMissed?: () => void;
}

// ===========================================
// Constants
// ===========================================

/** `PointerEvent.button` for the right mouse button. */
const SECONDARY_BUTTON = 2;

/** Pointer tuning shared by every scene. */
export const PICKING_TUNING = {
  /** A press that moves further than this before release is a drag, not a click. */
  clickSlopPx: 4,
} as const;

// ===========================================
// Controller
// ===========================================

/**
 * Pointer input over a scene turned into hover and selection for any
 * kind of pickable thing: moving highlights what is under the pointer, a
 * press-and-release without drag selects it. The one pointer-to-selection
 * implementation (#369): the overworld uses it through `cityPickerAdapter`
 * and the tactical screen through its target picker.
 *
 * ```
 *   pointermove ──▶ pick ──▶ picker.setHovered
 *   pointerdown ──▶ remember press
 *   pointerup   ──▶ moved ≤ slop? pick ─┬─ nothing there ──▶ onMissed
 *                                       ├─ right button + onInvoked ──▶ onInvoked
 *                                       └─ otherwise ──▶ select ──▶ onSelected
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
    return world === undefined ? undefined : this.projectPoint(world);
  }

  /**
   * Where a world point appears, in client pixels, or undefined when
   * detached. The projection `screenPositionOf` uses, for callers that
   * already have the point — a unit's head rather than its feet.
   */
  projectPoint(world: Vec3): Vec2 | undefined {
    if (!this.surface) {
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

  /**
   * Selects what is under a release that did not drag — or, for the
   * secondary button on a scene that asked for one, invokes it instead.
   */
  private readonly handlePointerUp = (event: PointerEvent): void => {
    const press = this.press;
    this.press = undefined;
    if (!press) {
      return;
    }
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > PICKING_TUNING.clickSlopPx) {
      return;
    }
    if (this.options.isLocked?.() === true) {
      return;
    }
    const id = this.pickAt(event);
    if (id === undefined) {
      this.options.onMissed?.();
      return;
    }
    const invoke = this.options.onInvoked;
    if (event.button === SECONDARY_BUTTON && invoke) {
      invoke(id);
      return;
    }
    this.select(id);
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
    if (this.isSameId(id, this.hovered)) {
      return;
    }
    this.hovered = id;
    this.picker.setHovered(id);
  }

  /** Whether two optional ids name the same thing, through the picker's own comparison when it has one. */
  private isSameId(a: TId | undefined, b: TId | undefined): boolean {
    if (a === undefined || b === undefined) {
      return a === b;
    }
    return this.picker.sameId ? this.picker.sameId(a, b) : a === b;
  }
}

// ===========================================
// Adapters
// ===========================================

/** Adapts the overworld's `CityPicker` to the generic `Picker` contract. */
export function cityPickerAdapter(picker: CityPicker): Picker<CityId> {
  return {
    pick: (ndc, camera) => picker.pickCity(ndc, camera),
    setHovered: (id) => {
      picker.setHovered(id);
    },
    setSelected: (id) => {
      picker.setSelected(id);
    },
    worldPosition: (id) => picker.markerWorldPosition(id),
  };
}

/**
 * Adapts the overworld scene's city, installation and region pickers
 * into one `Picker` over `OverworldPick` (#1155): a settlement under
 * the pointer wins, then a built installation, then the land of a
 * region, and the sea is a miss. Hover and selection are pushed to
 * every part of the scene, clearing the parts the pick is not.
 *
 * ```
 *   pick ──▶ pickCity ──hit──▶ { city }
 *              └─miss──▶ pickInstallation ──hit──▶ { installation }
 *                            └─miss──▶ pickRegion ──hit──▶ { region }
 *                                          └─miss──▶ undefined
 * ```
 */
export function overworldPickerAdapter(
  picker: CityPicker & InstallationPicker & RegionPicker,
): Picker<OverworldPick> {
  return {
    pick: (ndc, camera) => {
      const cityId = picker.pickCity(ndc, camera);
      if (cityId !== undefined) {
        return cityPick(cityId);
      }
      const deployableId = picker.pickInstallation(ndc, camera);
      if (deployableId !== undefined) {
        return installationPick(deployableId);
      }
      const regionId = picker.pickRegion(ndc, camera);
      return regionId === undefined ? undefined : regionPick(regionId);
    },
    setHovered: (pick) => {
      picker.setHovered(pick?.kind === "city" ? pick.cityId : undefined);
      picker.setHoveredInstallation(
        pick?.kind === "installation" ? pick.deployableId : undefined,
      );
      picker.setHoveredRegion(
        pick?.kind === "region" ? pick.regionId : undefined,
      );
    },
    setSelected: (pick) => {
      picker.setSelected(pick?.kind === "city" ? pick.cityId : undefined);
      picker.setSelectedInstallation(
        pick?.kind === "installation" ? pick.deployableId : undefined,
      );
      picker.setSelectedRegion(
        pick?.kind === "region" ? pick.regionId : undefined,
      );
    },
    worldPosition: (pick) => {
      switch (pick.kind) {
        case "city":
          return picker.markerWorldPosition(pick.cityId);
        case "installation":
          return picker.installationWorldPosition(pick.deployableId);
        case "region":
          return undefined;
      }
    },
    sameId: samePick,
  };
}

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
