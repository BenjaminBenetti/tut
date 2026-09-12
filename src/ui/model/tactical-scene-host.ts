import type { LayerFocus } from "../../graphics/model/layer-focus";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Vec2 } from "../../core/model/grid";
import type { UnitId } from "../../tactical/model/unit";
import type {
  TacticalIntentSink,
  TacticalInvokeTarget,
} from "./tactical-intent";

// ===========================================
// Types
// ===========================================

/**
 * What the screen wants to hear while an update plays. The scene plays
 * a batch one event at a time; what the HUD says about each event —
 * its log line, the words above the unit, a phase banner — should land
 * as that event happens on the map, not all at once before the first
 * frame. Without this the whole bug phase read as one jump followed by
 * an animation of it.
 */
export interface TacticalUpdateHooks {
  /** Called as each event begins to play, in order. */
  readonly onEvent?: (event: TacticalEvent) => void;
  /** Called once the units stand where the mission says, after the last event. */
  readonly onSettled?: () => void;
}

// ===========================================
// TacticalSceneHost
// ===========================================

/**
 * Lets the tactical screen borrow a three.js scene for the mission it
 * shows without importing three itself (architecture §3). The app
 * builds the scene, camera, models and input controller; the screen
 * owns the DOM around the viewport and the store subscription.
 *
 * ```
 *   screen.mount ──► host.attach(viewport, mission, intents)   builds scene + input
 *   store change ──► host.update(mission, events)               animates, then moves units
 *   selection    ──► host.select(unitId)                        range / cover / LOS overlays
 *   layer keys   ──► host.stepLayerFocus(±1)                    peels storeys off the map
 *   screen.unmount ► host.release()                             disposes everything
 * ```
 */
export interface TacticalSceneHost {
  /**
   * Builds the scene for `mission` inside `container`, routing the
   * player's intents to `intents`. Resolves once the units are placed.
   */
  attach(
    container: HTMLElement,
    mission: TacticalState,
    intents: TacticalIntentSink,
  ): Promise<void>;

  /**
   * Plays `events` in order, then brings the units in step with the
   * newer mission state. Resolves when the units are placed; `hooks`
   * hears each event as it plays and the moment the scene settles.
   */
  update(
    mission: TacticalState,
    events?: readonly TacticalEvent[],
    hooks?: TacticalUpdateHooks,
  ): Promise<void>;

  /**
   * Frames a tile on the map, or clears the frame: the tile the action
   * wheel is open on, so the ring and the ground it belongs to read as
   * one thing.
   *
   * @param tile - The tile to frame, or undefined for none.
   */
  markTile(tile: TileCoord | undefined): void;

  /**
   * Shows the overlays for a selected unit, or clears them.
   *
   * @param unitId - The selected unit.
   * @param targetId - The armed target, when one is chosen. It narrows
   *   the sight cue to that target rather than to any enemy (#517),
   *   which is what a player facing a refusal needs to see.
   */
  select(unitId: UnitId | undefined, targetId?: string): void;

  /**
   * Says something above a unit: what it just did, or why it could not.
   *
   * One mechanism for both (#1030, #1029). A refusal and a completed
   * action are the same shape of thing — something resolved, and the
   * player should learn it where it happened rather than by reading the
   * edge of the screen. It is the floater the damage numbers already
   * use, which is #1029's question answered: the same one.
   *
   * @param unitId - The unit to speak above.
   * @param text - Words in the player's language, not an error kind.
   */
  notice(unitId: UnitId, text: string): void;

  /**
   * Shows or hides the weapon-range outline (#522). The screen owns the
   * toggle so the state survives a re-selection; the scene only draws.
   */
  setWeaponRangeVisible(visible: boolean): void;

  /**
   * Where a world thing appears on screen, in client pixels, or
   * undefined when it is not drawn.
   *
   * The host owns the camera, so it is the only thing that can answer
   * this. In-world UI anchors to a **world reference** rather than to
   * the pixel a click happened at (ADR 0007 §2.2), which is what lets a
   * menu follow its target and dismiss itself when the target goes.
   *
   * @param target - The unit, spawner or tile the menu belongs to.
   * @returns Client pixels, or undefined when nothing is drawn there.
   */
  screenPositionOf(target: TacticalInvokeTarget): Vec2 | undefined;

  /**
   * Where the top of a unit's model is on screen, in client pixels, or
   * undefined when it is not drawn: the anchor for its status chip.
   *
   * @param unitId - The unit.
   */
  unitHeadScreenPosition(unitId: UnitId): Vec2 | undefined;

  /**
   * Centres the view on a unit.
   *
   * The camera rig has had `lookAt` since it was written, and until now
   * `frameMission` called it once at mission start and nothing called it
   * again — so a unit selected off screen could not be recovered except
   * by panning until it turned up (#1041). This is the caller it was
   * missing, not new machinery.
   *
   * @param unitId - The unit to centre on.
   */
  lookAtUnit(unitId: UnitId): void;

  /**
   * Moves the view `delta` storeys and returns where it landed (#961).
   *
   * The scene owns this rather than the mission: it changes which
   * storeys are drawn and nothing else — no AP, no turn, no refusal.
   * The focus is returned so the screen can show it without asking a
   * second time, and because clamping means the caller cannot predict
   * it from `delta` alone.
   *
   * @param delta - Storeys to move; `+1` is up.
   * @returns The focus after the step, or undefined when no scene is attached.
   */
  stepLayerFocus(delta: number): LayerFocus | undefined;

  /** Where the view is now, or undefined when no scene is attached. */
  layerFocus(): LayerFocus | undefined;

  /** Tears the scene down. Safe to call when not attached. */
  release(): void;
}
