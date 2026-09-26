import type { TileCoord } from "../../mapgen/model/tile-coord";

// ===========================================
// Tech carcass
// ===========================================

/** Id of a tech carcass on the map, issued with the `"carcass"` prefix. */
export type TechCarcassId = string;

/**
 * The prefix every carcass id is issued with, by the mission start for
 * a hook's carcass and by Salvage Rich for its extra ones.
 */
export const CARCASS_ID_PREFIX = "carcass";

/**
 * A dead bug rich in tech points lying on a `tech-carcass` hook (#1171,
 * GDD §6.3). An infantry squad beside it spends the interact action to
 * strip it; the points come home with a win or an extraction. The
 * record stays once harvested so the debrief and the renderer can tell
 * a stripped carcass from one that was never there.
 */
export interface TechCarcass {
  readonly id: TechCarcassId;
  /** The tile it lies on. */
  readonly pos: TileCoord;
  /** Whole tech points harvesting it yields; decided when the mission was offered. */
  readonly techPoints: number;
  /** True once a squad has stripped it. */
  readonly harvested: boolean;
}
