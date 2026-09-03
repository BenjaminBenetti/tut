import type { Vec2, Vec3 } from "../../core/model/grid";
import type { CameraInputSurface } from "../../graphics/controller/camera-input-controller";
import type {
  Picker,
  PickingSurface,
} from "../../graphics/controller/picking-controller";
import { PickingController } from "../../graphics/controller/picking-controller";
import type { FrameUpdatable } from "../../graphics/model/frame-updatable";
import type { SceneCamera } from "../../graphics/model/scene-camera";
import type { TilePicker } from "../../graphics/model/tile-picker";
import type { UnitPicker } from "../../graphics/model/unit-picker";
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
export type TacticalInputSurface = CameraInputSurface & PickingSurface;

/** What the scene must offer: unit and tile hit-testing with highlights. */
export type TacticalPicker = UnitPicker & TilePicker;

/** The camera type the generic picker hands through; named here so `ui/` never imports three. */
type PickCamera = Parameters<Picker<TacticalTarget>["pick"]>[1];

/** What a pick lands on: a unit, or the tile under an empty spot. */
export type TacticalTarget =
  | { readonly kind: "unit"; readonly unitId: UnitId }
  | { readonly kind: "tile"; readonly tile: TileCoord };

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
// Target picker
// ===========================================

/**
 * Adapts the scene's unit and tile pickers to one `Picker<TacticalTarget>`
 * for the generic `PickingController`: a pick tries the unit under the
 * pointer, then the tile; hover forwards units to the scene and
 * remembers the tile; selection forwards units only, since the scene
 * highlights units and a chosen tile is the screen's business.
 */
export class TacticalTargetPicker implements Picker<TacticalTarget> {
  // ===========================================
  // Fields
  // ===========================================

  private readonly scene: TacticalPicker;
  private hoveredUnit: UnitId | undefined;
  private hoveredTile: TileCoord | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param scene - The scene's unit and tile pickers. */
  constructor(scene: TacticalPicker) {
    this.scene = scene;
  }

  // ===========================================
  // Picker
  // ===========================================

  /** The unit under the coordinate, else the tile, else undefined. */
  pick(ndc: Vec2, camera: PickCamera): TacticalTarget | undefined {
    const unitId = this.scene.pickUnit(ndc, camera);
    if (unitId !== undefined) {
      return { kind: "unit", unitId };
    }
    const tile = this.scene.pickTile(ndc, camera);
    return tile === undefined ? undefined : { kind: "tile", tile };
  }

  /** Highlights a hovered unit in the scene (only when it changes) and remembers a hovered tile. */
  setHovered(target: TacticalTarget | undefined): void {
    const unitId = target?.kind === "unit" ? target.unitId : undefined;
    if (unitId !== this.hoveredUnit) {
      this.hoveredUnit = unitId;
      this.scene.setHovered(unitId);
    }
    this.hoveredTile = target?.kind === "tile" ? target.tile : undefined;
  }

  /** Marks a selected unit in the scene; a tile selection leaves the unit highlight alone. */
  setSelected(target: TacticalTarget | undefined): void {
    if (target === undefined || target.kind === "unit") {
      this.scene.setSelected(target?.unitId);
    }
  }

  /** A unit's feet or a tile's top centre. */
  worldPosition(target: TacticalTarget): Vec3 | undefined {
    return target.kind === "unit"
      ? this.scene.unitWorldPosition(target.unitId)
      : this.scene.tileWorldPosition(target.tile);
  }

  /** The tile currently under the pointer, for a HUD readout. */
  getHoveredTile(): TileCoord | undefined {
    return this.hoveredTile;
  }
}

// ===========================================
// Controller
// ===========================================

/**
 * Turns input over the tactical scene into intents (GDD §6.2). Pointer
 * hover and selection are #366's `PickingController` over a
 * `TacticalTargetPicker` (unit first, then tile); shortcut keys report
 * actions and End Turn; camera rotate, zoom and pan are the injected
 * camera input, attached and detached together with this controller.
 * Every pick and projection goes through the live camera, so it stays
 * correct at any yaw.
 *
 * ```
 *   pointer ──▶ PickingController<TacticalTarget> ──▶ onSelected ──▶ emit select-unit | select-tile
 *   keydown ──▶ TACTICAL_SHORTCUTS ──▶ emit action | end-turn
 *   update  ──▶ cameraInput.update
 * ```
 */
export class TacticalInputController implements FrameUpdatable {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: TacticalInputDeps;
  private readonly targets: TacticalTargetPicker;
  private readonly picking: PickingController<TacticalTarget>;
  private surface: TacticalInputSurface | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Scene picker, camera owner, camera input and where intents go. */
  constructor(deps: TacticalInputDeps) {
    this.deps = deps;
    this.targets = new TacticalTargetPicker(deps.picker);
    this.picking = new PickingController(this.targets, deps.camera, {
      onSelected: (target) => {
        this.emitSelection(target);
      },
    });
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
    this.picking.attach(surface);
    surface.ownerDocument.addEventListener("keydown", this.handleKeyDown);
    this.deps.cameraInput.attach(surface);
  }

  /** Stops listening, clears hover and detaches the camera input. */
  detach(): void {
    const surface = this.surface;
    if (!surface) {
      return;
    }
    this.picking.detach();
    surface.ownerDocument.removeEventListener("keydown", this.handleKeyDown);
    this.deps.cameraInput.detach();
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
    this.picking.select({ kind: "unit", unitId });
  }

  /** Reports a tile as if clicked. Selection highlight stays on the unit. */
  selectTile(tile: TileCoord): void {
    this.picking.select({ kind: "tile", tile });
  }

  /** The tile currently under the pointer, for a HUD readout. */
  getHoveredTile(): TileCoord | undefined {
    return this.targets.getHoveredTile();
  }

  // ===========================================
  // Screen positions
  // ===========================================

  /** Where a unit's feet appear in client pixels, or undefined when detached or unknown. */
  unitScreenPosition(unitId: UnitId): Vec2 | undefined {
    return this.picking.screenPositionOf({ kind: "unit", unitId });
  }

  /** Where a tile's top centre appears in client pixels, or undefined when detached or off the map. */
  tileScreenPosition(tile: TileCoord): Vec2 | undefined {
    return this.picking.screenPositionOf({ kind: "tile", tile });
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
  // Private Methods
  // ===========================================

  /** Turns a picked target into the matching select intent. */
  private emitSelection(target: TacticalTarget): void {
    this.deps.intents.emit(
      target.kind === "unit"
        ? { kind: "select-unit", unitId: target.unitId }
        : { kind: "select-tile", tile: target.tile },
    );
  }

  /** Reports the action or End Turn bound to a key; ignores repeats and typing in form controls. */
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
}

/** True when the key event came from a text control, so shortcuts never eat typing. */
function isTyping(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") {
    return false;
  }
  const tag = (target as { tagName?: unknown }).tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
