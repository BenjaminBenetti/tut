import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { MechLoadout } from "../../roster/model/mech-loadout";

// ===========================================
// Mech wreck
// ===========================================

/** Id of a mech wreck on the map, issued with the `"wreck"` prefix. */
export type MechWreckId = string;

/** The prefix every `MechWreckId` is issued with. */
export const WRECK_ID_PREFIX = "wreck";

/**
 * A lost mech lying where it fell, on the map's `wreck` hook (arc
 * §6.6). A prop, not a unit: it takes no hits, blocks nothing, and
 * never acts. A squad works it for its parts through the mission's
 * `strip-wreck` objective, which keeps the progress; the wreck itself
 * never changes, so the renderer draws it the same from first turn to
 * last.
 *
 * ```
 *   hook tiles (footprint × footprint, one level)
 *     ├── tiles   every tile it covers; a squad works it from beside any
 *     └── pos     the middle tile: where it is drawn and blipped
 * ```
 */
export interface MechWreck {
  readonly id: MechWreckId;
  /** The middle of the footprint: where the wreck is drawn and marked. */
  readonly pos: TileCoord;
  /** Every tile the wreck lies across, in hook order. */
  readonly tiles: readonly TileCoord[];
  /** The lost mech's name, for the briefing, the tracker and the log. */
  readonly mechName: string;
  /** What the mech wore when it fell, so the wreck is drawn as it stood. */
  readonly loadout: MechLoadout;
}
