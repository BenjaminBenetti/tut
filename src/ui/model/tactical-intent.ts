import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { SpawnerId } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";

// ===========================================
// Intents
// ===========================================

/**
 * Keyboard-driven actions the player can ask for. The pointer reaches
 * the same actions through the wheel (#1112); these are the letters
 * that reach them without it.
 */
export type TacticalAction =
  | "move"
  | "attack"
  | "overwatch"
  | "reload"
  | "interact"
  | "extract"
  | "next-unit"
  | "next-target"
  | "toggle-range"
  | "cancel";

/** Every `TacticalAction`, in a fixed order. */
export const TACTICAL_ACTIONS = [
  "move",
  "attack",
  "overwatch",
  "reload",
  "interact",
  "extract",
  "next-unit",
  "next-target",
  "toggle-range",
  "cancel",
] as const satisfies readonly TacticalAction[];

/** What a click on the map landed on: a unit, an egg spawner or a tile. */
export type TacticalInvokeTarget =
  | { readonly kind: "unit"; readonly unitId: UnitId }
  | { readonly kind: "spawner"; readonly spawnerId: SpawnerId }
  | { readonly kind: "tile"; readonly tile: TileCoord };

/**
 * What the input controller reports: a unit or tile the player pointed
 * at, an action shortcut, or End Turn. Plain data, so a screen can log
 * or replay it.
 *
 * `select-*` and `invoke` are the two buttons (#520, #1112): the left
 * button points at something — a friendly unit to select, or anything
 * else to open the action wheel on — and the right button walks the
 * selected unit there.
 *
 * `layer-step` is the odd one out and stays here on purpose: it changes
 * nothing in the mission, only which storeys the scene draws (#961). It
 * is an intent rather than a direct call so the one key table keeps
 * owning every binding, and so the screen can show the storey it landed
 * on without the scene reaching into the HUD.
 */
export type TacticalIntent =
  | { readonly kind: "select-unit"; readonly unitId: UnitId }
  | { readonly kind: "select-spawner"; readonly spawnerId: SpawnerId }
  | { readonly kind: "select-tile"; readonly tile: TileCoord }
  | { readonly kind: "invoke"; readonly target: TacticalInvokeTarget }
  | { readonly kind: "action"; readonly action: TacticalAction }
  | { readonly kind: "layer-step"; readonly delta: number }
  | { readonly kind: "end-turn" };

/** Receives every intent the input layer produces. The tactical screen implements it. */
export interface TacticalIntentSink {
  /** Handles one intent; never throws for anything a player can do. */
  emit(intent: TacticalIntent): void;
}

// ===========================================
// Test hooks
// ===========================================

/**
 * What a dev build exposes on `window.__tutTactical__` so end-to-end
 * tests can drive the tactical input without pointer input, and can
 * find where things are on screen for real clicks (#340, like #74's).
 */
export interface TacticalTestHooks {
  /** Selects a unit as if clicked. */
  selectUnit(unitId: UnitId): void;
  /** Targets an egg spawner as if clicked (#484). */
  selectSpawner(spawnerId: SpawnerId): void;
  /** Points at a tile as if left-clicked: opens the action wheel there (#1112). */
  selectTile(tile: TileCoord): void;
  /** Walks the selected unit to a tile as if right-clicked (#520, #1112). */
  invokeTile(tile: TileCoord): void;
  /** Client-pixel position of a unit's feet, for a real pointer click. */
  unitScreenPosition(unitId: UnitId): { x: number; y: number } | undefined;
  /** Client-pixel position of an egg spawner's base, for a real pointer click. */
  spawnerScreenPosition(
    spawnerId: SpawnerId,
  ): { x: number; y: number } | undefined;
  /** Client-pixel position of a tile's top centre, for a real pointer click. */
  tileScreenPosition(tile: TileCoord): { x: number; y: number } | undefined;
  /** Moves the view `delta` storeys, as the layer keys do (#961). */
  stepLayer(delta: number): void;
  /**
   * Puts the map back on the single height cut it used before #978, so a
   * capture can show the defect and the fix **in one run**.
   *
   * Exposed because the two frames have to share a run to be comparable:
   * the capture harness is not reproducible across runs (#996), so a
   * before/after pair drawn in separate runs cannot tell a change from
   * the harness. This drives view state that already exists — the
   * height cut is still what `mapgen-preview`'s level slider uses — and
   * adds no behaviour of its own.
   *
   * @param level - Highest engine layer to draw, or undefined for all.
   */
  applyHeightCut(level: number | undefined): void;
}

/**
 * The part of {@link TacticalTestHooks} the input controller can supply
 * on its own. The scene host completes it: the height cut is the
 * scene's, and the controller has no handle on the map view.
 */
export type TacticalInputHooks = Omit<TacticalTestHooks, "applyHeightCut">;

declare global {
  interface Window {
    __tutTactical__?: TacticalTestHooks;
  }
}
