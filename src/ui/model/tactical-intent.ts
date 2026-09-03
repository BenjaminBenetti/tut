import type { TileCoord } from "../../mapgen/model/tile-coord";
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
  "move" | "attack" | "overwatch" | "reload" | "next-unit" | "cancel";

/** Every `TacticalAction`, in a fixed order. */
export const TACTICAL_ACTIONS = [
  "move",
  "attack",
  "overwatch",
  "reload",
  "next-unit",
  "cancel",
] as const satisfies readonly TacticalAction[];

/**
 * What the input controller reports: a unit or tile the player pointed
 * at, an action shortcut, or End Turn. Plain data, so a screen can log
 * or replay it.
 */
export type TacticalIntent =
  | { readonly kind: "select-unit"; readonly unitId: UnitId }
  | { readonly kind: "select-tile"; readonly tile: TileCoord }
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
  /** Selects a tile as if clicked. */
  selectTile(tile: TileCoord): void;
  /** Client-pixel position of a unit's feet, for a real pointer click. */
  unitScreenPosition(unitId: UnitId): { x: number; y: number } | undefined;
  /** Client-pixel position of a tile's top centre, for a real pointer click. */
  tileScreenPosition(tile: TileCoord): { x: number; y: number } | undefined;
}

declare global {
  interface Window {
    __tutTactical__?: TacticalTestHooks;
  }
}
