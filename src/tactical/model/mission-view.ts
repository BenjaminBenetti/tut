import type { TacticalState } from "./tactical-state";

// ===========================================
// Mission view
// ===========================================

declare const perceived: unique symbol;

/**
 * The mission as one side perceives it (ADR 0006 §2.3): every read a
 * behaviour uses today, with `units` already filtered to that side's own
 * units plus the enemies it can see, and `vision` narrowed to its own.
 *
 * ```
 *   TacticalState ──► viewFor(mission, "bugs") ──► MissionView ──► behaviour
 * ```
 *
 * It is a `TacticalState` structurally, so a behaviour can still hand it
 * to `searchMoves`, `pathTo` and `hasLineOfSight` unchanged — those read
 * the map and the units, and a view is a mission with fewer units in it.
 * What it adds is a phantom brand: a raw `TacticalState` **will not
 * compile** where a `MissionView` is asked for, so a behaviour cannot be
 * handed the omniscient mission by accident. That is the whole point of
 * §2.3 — the ADR rejected a `canSee()` predicate precisely because a
 * behaviour that forgets to call one still compiles and still cheats.
 *
 * Only `viewFor` can make one.
 */
export type MissionView = TacticalState & {
  readonly [perceived]: true;
};
