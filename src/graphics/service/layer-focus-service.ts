import { STOREY_LAYERS } from "../../core/model/elevation";
import type { LayerFocus } from "../model/layer-focus";

// ===========================================
// Types
// ===========================================

/**
 * What the focus needs from a building: where it stands, and how many
 * storeys it has. Narrower than `Building` on purpose — the cut is
 * arithmetic over heights, and a `Building` brings a footprint, a roof,
 * entrances and connectors that have no say in it.
 */
export interface BuildingHeight {
  /** Layer of the flattened terrain under the building. */
  readonly groundLevel: number;
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
 * The elevation the cut is measured from: the lowest ground any building
 * stands on, or `0` on a map with none.
 *
 * The cut is a **height** expressed in storeys, not a per-building floor
 * number, so one number has to serve the whole map. Anchoring to the
 * lowest building means raising the focus reveals a building standing up
 * a hill later than one on the flat — which is what an elevation cut
 * should do. `mapgen-preview`'s `?floor=N` has anchored the same way
 * since #829.
 *
 * @param map - The map's buildings.
 * @returns The anchor layer.
 */
export function focusGroundLevel(map: LayerFocusSource): number {
  return map.buildings.length === 0
    ? 0
    : Math.min(...map.buildings.map((building) => building.groundLevel));
}

/**
 * How many distinct storey views the map offers, at least one.
 *
 * A map with no buildings, or whose tallest building is a single storey,
 * offers exactly one: there is nothing above the ground floor to peel,
 * so the control is inert rather than absent. That is deliberate — a key
 * that does nothing on open ground is easier to explain than a key that
 * appears and disappears.
 *
 * @param map - The map's buildings.
 * @returns Storeys available, `>= 1`.
 */
export function storeyCount(map: LayerFocusSource): number {
  const ground = focusGroundLevel(map);
  const top = Math.max(
    ground,
    ...map.buildings.map(
      (building) =>
        building.groundLevel + building.floors.length * STOREY_LAYERS,
    ),
  );
  return Math.max(1, Math.ceil((top - ground) / STOREY_LAYERS));
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
 * @returns The focus, with the cut that produces it.
 */
export function focusAt(map: LayerFocusSource, storey: number): LayerFocus {
  const count = storeyCount(map);
  const clamped = Math.min(count - 1, Math.max(0, Math.trunc(storey)));
  return {
    storey: clamped,
    storeyCount: count,
    cutLevel:
      clamped >= count - 1
        ? undefined
        : focusGroundLevel(map) + (clamped + 1) * STOREY_LAYERS - 1,
  };
}

/**
 * The focus the map opens on: the top storey, which is the uncut map.
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
