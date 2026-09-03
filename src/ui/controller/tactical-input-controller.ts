import { Vector3 } from "three";

import type { Vec2 } from "../../core/model/grid";
import type { CameraInputSurface } from "../../graphics/controller/camera-input-controller";
import { MAP_PICKING_TUNING } from "../../graphics/controller/map-picking-controller";
import type { FrameUpdatable } from "../../graphics/model/frame-updatable";
import type { SceneCamera } from "../../graphics/model/scene-camera";
import type { TilePicker } from "../../graphics/model/tile-picker";
import type { UnitPicker } from "../../graphics/model/unit-picker";
import { ndcToPointer, pointerToNdc } from "../../graphics/service/pointer-ndc";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "../../tactical/model/unit";
import type {
  TacticalAction,
  TacticalIntentSink,
  TacticalTestHooks,
} from "../model/tactical-intent";

// ===========================================
// Types
// ===========================================

/** The DOM surface the controller listens on: the element the map canvas lives in. */
export type TacticalInputSurface = CameraInputSurface &
  Pick<HTMLElement, "getBoundingClientRect">;

/** What the scene must offer: unit and tile hit-testing with highlights. */
export type TacticalPicker = UnitPicker & TilePicker;

/** The camera input this controller owns while attached (#9's controller). */
export interface CameraInput extends FrameUpdatable {
  /** Starts listening on the surface. */
  attach(surface: CameraInputSurface): void;
  /** Stops listening. */
  detach(): void;
}

/** What the controller is composed from. */
export interface TacticalInputDeps {
  readonly picker: TacticalPicker;
  /** Owner of the camera the scene is seen through; picking projects through it, so rotation stays correct. */
  readonly camera: SceneCamera;
  /** Rotate, zoom and pan; attached and detached with this controller. */
  readonly cameraInput: CameraInput;
  readonly intents: TacticalIntentSink;
}

// ===========================================
// Constants
// ===========================================

/**
 * Keyboard shortcuts (GDD §6.2 actions plus End Turn), keyed by
 * `KeyboardEvent.key` lower-cased. Q / E / WASD / arrows belong to the
 * camera controller and are not listed here.
 */
export const TACTICAL_SHORTCUTS: Readonly<
  Record<string, TacticalAction | "end-turn">
> = {
  m: "move",
  a: "attack",
  f: "attack",
  o: "overwatch",
  r: "reload",
  tab: "next-unit",
  escape: "cancel",
  enter: "end-turn",
  end: "end-turn",
};

// ===========================================
// Controller
// ===========================================

/**
 * Turns pointer and keyboard input over the tactical scene into intents
 * (GDD §6.2): moving hovers the unit under the pointer, else the tile; a
 * click without drag selects what is hovered and reports it; shortcut
 * keys report actions and End Turn. Camera rotate, zoom and pan are
 * delegated to the injected camera input, attached and detached
 * together with this controller. Every pick projects through the live
 * camera, so picking stays correct at any yaw.
 *
 * ```
 *   pointermove ──▶ pickUnit ?? pickTile ──▶ picker.setHovered / hovered tile
 *   pointerup   ──▶ no drag? unit ──▶ setSelected + emit select-unit
 *                            tile ──▶ emit select-tile
 *   keydown     ──▶ TACTICAL_SHORTCUTS ──▶ emit action | end-turn
 * ```
 */
export class TacticalInputController implements FrameUpdatable {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: TacticalInputDeps;
  private surface: TacticalInputSurface | undefined;
  private hoveredUnit: UnitId | undefined;
  private hoveredTile: TileCoord | undefined;
  private press: Vec2 | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Scene picker, camera owner, camera input and where intents go. */
  constructor(deps: TacticalInputDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Starts listening on `surface` and its document; attaching while attached detaches first. */
  attach(surface: TacticalInputSurface): void {
    if (this.surface) {
      this.detach();
    }
    this.surface = surface;
    surface.addEventListener("pointermove", this.handlePointerMove);
    surface.addEventListener("pointerdown", this.handlePointerDown);
    surface.addEventListener("pointerup", this.handlePointerUp);
    surface.addEventListener("pointerleave", this.handlePointerLeave);
    surface.ownerDocument.addEventListener("keydown", this.handleKeyDown);
    this.deps.cameraInput.attach(surface);
  }

  /** Stops listening, clears hover and detaches the camera input. */
  detach(): void {
    const surface = this.surface;
    if (!surface) {
      return;
    }
    surface.removeEventListener("pointermove", this.handlePointerMove);
    surface.removeEventListener("pointerdown", this.handlePointerDown);
    surface.removeEventListener("pointerup", this.handlePointerUp);
    surface.removeEventListener("pointerleave", this.handlePointerLeave);
    surface.ownerDocument.removeEventListener("keydown", this.handleKeyDown);
    this.deps.cameraInput.detach();
    this.setHoveredUnit(undefined);
    this.hoveredTile = undefined;
    this.press = undefined;
    this.surface = undefined;
  }

  /** True while listeners are registered. */
  isAttached(): boolean {
    return this.surface !== undefined;
  }

  /** Advances the camera input (held keys pan and rotate over time). */
  update(deltaSeconds: number): void {
    this.deps.cameraInput.update(deltaSeconds);
  }

  // ===========================================
  // Selection
  // ===========================================

  /** Selects a unit as if clicked: highlights it and reports it. */
  selectUnit(unitId: UnitId): void {
    this.deps.picker.setSelected(unitId);
    this.deps.intents.emit({ kind: "select-unit", unitId });
  }

  /** Reports a tile as if clicked. Selection highlight stays on the unit. */
  selectTile(tile: TileCoord): void {
    this.deps.intents.emit({ kind: "select-tile", tile });
  }

  /** The tile currently under the pointer, for a HUD readout. */
  getHoveredTile(): TileCoord | undefined {
    return this.hoveredTile;
  }

  // ===========================================
  // Screen positions
  // ===========================================

  /** Where a unit's feet appear in client pixels, or undefined when detached or unknown. */
  unitScreenPosition(unitId: UnitId): Vec2 | undefined {
    return this.project(this.deps.picker.unitWorldPosition(unitId));
  }

  /** Where a tile's top centre appears in client pixels, or undefined when detached or off the map. */
  tileScreenPosition(tile: TileCoord): Vec2 | undefined {
    return this.project(this.deps.picker.tileWorldPosition(tile));
  }

  /** The end-to-end test hooks for this controller. */
  hooks(): TacticalTestHooks {
    return {
      selectUnit: (unitId) => {
        this.selectUnit(unitId);
      },
      selectTile: (tile) => {
        this.selectTile(tile);
      },
      unitScreenPosition: (unitId) => this.unitScreenPosition(unitId),
      tileScreenPosition: (tile) => this.tileScreenPosition(tile),
    };
  }

  // ===========================================
  // Pointer
  // ===========================================

  /** Hovers the unit under the pointer, else remembers the tile. */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    const ndc = this.ndcOf(event);
    if (!ndc) {
      return;
    }
    const unit = this.deps.picker.pickUnit(ndc, this.deps.camera.camera);
    this.setHoveredUnit(unit);
    this.hoveredTile =
      unit === undefined
        ? this.deps.picker.pickTile(ndc, this.deps.camera.camera)
        : undefined;
  };

  /** Remembers where a press started so a drag can be told from a click. */
  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.press = { x: event.clientX, y: event.clientY };
  };

  /** Selects the unit, else the tile, under a release that did not drag. */
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
    const ndc = this.ndcOf(event);
    if (!ndc) {
      return;
    }
    const camera = this.deps.camera.camera;
    const unit = this.deps.picker.pickUnit(ndc, camera);
    if (unit !== undefined) {
      this.selectUnit(unit);
      return;
    }
    const tile = this.deps.picker.pickTile(ndc, camera);
    if (tile !== undefined) {
      this.selectTile(tile);
    }
  };

  /** Clears hover and any pending press when the pointer leaves the surface. */
  private readonly handlePointerLeave = (): void => {
    this.setHoveredUnit(undefined);
    this.hoveredTile = undefined;
    this.press = undefined;
  };

  // ===========================================
  // Keyboard
  // ===========================================

  /** Reports the action or End Turn bound to a key; ignores typing in form controls. */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || isTyping(event.target)) {
      return;
    }
    const bound = TACTICAL_SHORTCUTS[event.key.toLowerCase()];
    if (bound === undefined) {
      return;
    }
    event.preventDefault();
    this.deps.intents.emit(
      bound === "end-turn"
        ? { kind: "end-turn" }
        : { kind: "action", action: bound },
    );
  };

  // ===========================================
  // Helpers
  // ===========================================

  /** Pushes a hover change to the picker only when it actually changed. */
  private setHoveredUnit(unitId: UnitId | undefined): void {
    if (unitId === this.hoveredUnit) {
      return;
    }
    this.hoveredUnit = unitId;
    this.deps.picker.setHovered(unitId);
  }

  /** Normalised device coordinate of a pointer event, or undefined when detached. */
  private ndcOf(
    event: Pick<PointerEvent, "clientX" | "clientY">,
  ): Vec2 | undefined {
    if (!this.surface) {
      return undefined;
    }
    return pointerToNdc(
      this.surface.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
  }

  /** Projects a world point to client pixels through the live camera. */
  private project(
    world: { x: number; y: number; z: number } | undefined,
  ): Vec2 | undefined {
    if (!this.surface || !world) {
      return undefined;
    }
    const ndc = new Vector3(world.x, world.y, world.z).project(
      this.deps.camera.camera,
    );
    return ndcToPointer(this.surface.getBoundingClientRect(), {
      x: ndc.x,
      y: ndc.y,
    });
  }
}

/** True when the key event came from a text control, so shortcuts never eat typing. */
function isTyping(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") {
    return false;
  }
  const tag = (target as { tagName?: unknown }).tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
