import type { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../model/tactical-state";
import type { TileKey } from "./movement-service";
import { liveSpawnerKeys, occupiedKeys } from "./movement-service";
import { buriedKeys } from "./tunnel-service";

// ===========================================
// Placement occupancy
// ===========================================

/**
 * Keys of the tiles no unit may arrive on: the one rule every way a
 * unit appears mid-map is held to — a hatchling (`spawn-service`), a
 * bug a setup rule places (`placed-bug-service`) and a unit the debug
 * menu places (`place-unit-handler`).
 *
 * ```
 *   held = occupiedKeys      every tile a living, surfaced unit stands on
 *                            (and a standing solid spawner's)
 *        ∪ buriedKeys        every tile a living burrower is under (#1179)
 *        ∪ liveSpawnerKeys   every tile of a spawner that still stands
 * ```
 *
 * Stricter than movement's `occupiedKeys`, which lets a surface unit
 * walk over and stop on a buried burrower: arriving is not walking, and
 * a unit dropped on top of a burrower would leave it nowhere to come
 * up. Tiles off the map are left out.
 *
 * @param mission - The mission, or a side's view of it.
 * @param index - The map's tile index.
 * @returns A fresh set the caller may add to (a bug placed earlier in
 *   the same call, for instance).
 */
export function placementHeldKeys(
  mission: TacticalState,
  index: TileIndex,
): Set<TileKey> {
  const held = new Set<TileKey>(occupiedKeys(mission, index));
  for (const key of buriedKeys(mission, index)) {
    held.add(key);
  }
  for (const key of liveSpawnerKeys(mission, index)) {
    held.add(key);
  }
  return held;
}
