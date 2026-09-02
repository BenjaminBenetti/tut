import type { Building } from "./building";
import type { Connector } from "./connector";
import type { PlacementHooks } from "./hook";
import type { MapRecipe } from "./map-recipe";
import type { Prop } from "./prop";
import type { Tile } from "./tile";

// ===========================================
// Tactical map
// ===========================================

/** Bumped when the shape of `TacticalMap` changes incompatibly. */
export const TACTICAL_MAP_VERSION = 1;

/**
 * The map contract (architecture §5, ADR 0004). Mapgen produces it,
 * tactical runs movement, line of sight and cover on it, graphics renders
 * it. Plain data; every invariant in ADR 0004 §6 holds for a map returned
 * by the generator.
 *
 * ```
 *   MapRecipe ──► generator ──► TacticalMap ──► tactical / graphics
 *      ▲                                          │
 *      └──────────── saved instead of the map ────┘
 * ```
 */
export interface TacticalMap {
  readonly version: typeof TACTICAL_MAP_VERSION;
  /** Seed and parameters that produced this map. */
  readonly recipe: MapRecipe;
  /** Tiles along `x`, exclusive upper bound. */
  readonly width: number;
  /** Tiles along `z`, exclusive upper bound. */
  readonly depth: number;
  /** Levels along `y`, exclusive upper bound; covers the highest roof. */
  readonly levels: number;
  /** Sparse: one record per standable surface. */
  readonly tiles: readonly Tile[];
  readonly buildings: readonly Building[];
  readonly connectors: readonly Connector[];
  readonly props: readonly Prop[];
  readonly hooks: PlacementHooks;
}

/** The subset of a map a tile index needs. */
export type TileGridSource = Pick<
  TacticalMap,
  "width" | "depth" | "levels" | "tiles"
>;
