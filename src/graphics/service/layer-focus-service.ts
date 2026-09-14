import type { LayerFocus } from "../model/layer-focus";

// ===========================================
// Types
// ===========================================

/**
 * What the focus needs from a building: how many storeys it has.
 * Narrower than `Building` on purpose — the range is arithmetic over a
 * floor count, and a `Building` brings a footprint, a roof, entrances
 * and connectors that have no say in it.
 */
export interface BuildingHeight {
  /** Only the count is read. */
  readonly floors: readonly unknown[];
}

/** The part of a map the focus is computed from: its buildings, and nothing else. */
export interface LayerFocusSource {
  readonly buildings: readonly BuildingHeight[];
}

// ===========================================
// Public Functions
// ===========================================

/**
 * How many distinct views the map offers, at least one: one per floor of
 * the tallest building, **plus the roof** (#1136).
 *
 * Counted per building rather than across the map's height (#978). The
 * two agree on the 57 % of generated maps whose buildings all stand on
 * one level, and disagree on the rest: measured over the 108-map matrix,
 * 43 % have buildings a whole storey or more apart, and there the map's
 * height counts elevation the player cannot act on. "Floor 3" has to
 * mean the third floor of whatever they are looking at, not a height
 * that is the third floor of one building and the first of another.
 *
 * The roof is a step of its own because it is the step the player was
 * missing (#1136): with the count equal to the floors, the top view of
 * the tallest building was its roof, and there was no press that took
 * the roof off to show the top floor. A one-floor building therefore
 * offers two views — its ground floor with the roof off, and roofed.
 *
 * A map with no buildings offers exactly one: there is nothing to peel,
 * so the control is inert rather than absent. That is deliberate — a
 * key that does nothing on open ground is easier to explain than a key
 * that appears and disappears.
 *
 * @param map - The map's buildings.
 * @returns Views available, `>= 1`.
 */
export function storeyCount(map: LayerFocusSource): number {
  return (
    1 + Math.max(0, ...map.buildings.map((building) => building.floors.length))
  );
}

/**
 * The focus for `storey`, clamped into the map's range.
 *
 * Clamped rather than wrapped: at high frequency a wrap turns "one more
 * press" into a jump across the whole building, and the player is
 * pressing without looking.
 *
 * @param map - The map's buildings.
 * @param storey - Storey asked for; out-of-range values clamp.
 * @returns The focus.
 */
export function focusAt(map: LayerFocusSource, storey: number): LayerFocus {
  const count = storeyCount(map);
  return {
    storey: Math.min(count - 1, Math.max(0, Math.trunc(storey))),
    storeyCount: count,
  };
}

/**
 * The focus the map opens on: the top storey, which is the uncut map
 * with every roof on.
 *
 * @param map - The map's buildings.
 * @returns The starting focus.
 */
export function topFocus(map: LayerFocusSource): LayerFocus {
  return focusAt(map, storeyCount(map) - 1);
}

/**
 * `focus` moved by `delta` storeys, clamped.
 *
 * @param map - The map's buildings.
 * @param focus - Where the player is now.
 * @param delta - Storeys to move; `+1` is up.
 * @returns The new focus.
 */
export function stepFocus(
  map: LayerFocusSource,
  focus: LayerFocus,
  delta: number,
): LayerFocus {
  return focusAt(map, focus.storey + delta);
}

/**
 * Whether `focus` is the top of its range: the whole map, roofs on.
 *
 * One predicate rather than a comparison at every consumer, because the
 * map view, the fog and the HUD all need the same answer and "the top"
 * is the one view where nothing at all is hidden (#1136).
 *
 * @param focus - The focus to ask about.
 * @returns True at the roofed top view.
 */
export function isTopFocus(focus: LayerFocus): boolean {
  return focus.storey >= focus.storeyCount - 1;
}

/**
 * The floor `focus` shows, one-based for the player, or `undefined` at
 * the roofed top view; and how many floors the map has to show.
 *
 * "Floor 2 of 2" then "All" rather than "2 of 3" then "3 of 3": the
 * top view is not a floor, it is the roof going back on, and a readout
 * that counted it as one made the player look for a third floor that
 * was not there (#1136).
 *
 * @param focus - The focus to describe.
 * @returns The floor shown and the floor count.
 */
export function floorOf(focus: LayerFocus): {
  readonly floor: number | undefined;
  readonly floors: number;
} {
  return {
    floor: isTopFocus(focus) ? undefined : focus.storey + 1,
    floors: focus.storeyCount - 1,
  };
}
