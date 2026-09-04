import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { SpawnerId } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";

// ===========================================
// Intents
// ===========================================

/**
 * Keyboard-driven actions the player can ask for. The tactical screen
 * maps them onto `TacticalCommand`s once #324 defines those; until then
 * they are the whole vocabulary the input layer speaks.
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

/**
 * The actions the bar offers, in the order it shows them. The number row
 * is bound from this list (#520), so a button and its digit cannot drift
 * apart: `1` is always whatever sits first on the bar.
 */
export const ACTION_BAR_ORDER = [
  "move",
  "attack",
  "overwatch",
  "reload",
  "interact",
  "extract",
  "end-turn",
] as const;

/** What the action bar can be told to do; also what a number key can pick. */
export type ActionBarAction = (typeof ACTION_BAR_ORDER)[number];

/** What a right click landed on (#520). */
export type TacticalInvokeTarget =
  | { readonly kind: "unit"; readonly unitId: UnitId }
  | { readonly kind: "spawner"; readonly spawnerId: SpawnerId }
  | { readonly kind: "tile"; readonly tile: TileCoord };

/**
 * What the input controller reports: a unit or tile the player pointed
 * at, an action shortcut, or End Turn. Plain data, so a screen can log
 * or replay it.
 *
 * `select-*` and `invoke` are the two halves of #520: the left button
 * only ever points at something, and the right button asks for the armed
 * action to happen there.
 */
export type TacticalIntent =
  | { readonly kind: "select-unit"; readonly unitId: UnitId }
  | { readonly kind: "select-spawner"; readonly spawnerId: SpawnerId }
  | { readonly kind: "select-tile"; readonly tile: TileCoord }
  | { readonly kind: "invoke"; readonly target: TacticalInvokeTarget }
  | { readonly kind: "action"; readonly action: TacticalAction }
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
  /** Selects a tile as if left-clicked. */
  selectTile(tile: TileCoord): void;
  /** Invokes the armed action on a tile as if right-clicked (#520). */
  invokeTile(tile: TileCoord): void;
  /** Client-pixel position of a unit's feet, for a real pointer click. */
  unitScreenPosition(unitId: UnitId): { x: number; y: number } | undefined;
  /** Client-pixel position of an egg spawner's base, for a real pointer click. */
  spawnerScreenPosition(
    spawnerId: SpawnerId,
  ): { x: number; y: number } | undefined;
  /** Client-pixel position of a tile's top centre, for a real pointer click. */
  tileScreenPosition(tile: TileCoord): { x: number; y: number } | undefined;
}

declare global {
  interface Window {
    __tutTactical__?: TacticalTestHooks;
  }
}
