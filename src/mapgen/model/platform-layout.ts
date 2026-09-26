import type { HookKind, HookMeta } from "./hook";
import type { ColumnCoord } from "./road";

// ===========================================
// Spore platform layout
// ===========================================

/**
 * Which of the finale's two linked boards a layout shapes (#1179): the
 * outer hull with the docking ring, or the core chamber the Sovereign
 * guards.
 */
export type PlatformStage = "hull" | "core";

/**
 * A square the platform planned for one hook: flat, clear of props and
 * on one level, by its lowest corner. The pad placer turns it into the
 * hook's tiles.
 */
export interface PlatformPad {
  /** The hook kind that stands on it, e.g. `docking-ring`. */
  readonly kind: HookKind;
  readonly x: number;
  readonly z: number;
  /** Side of the square in tiles. */
  readonly size: number;
  /** The ground level every column of the pad sits on. */
  readonly level: number;
  /** Extra hook metadata beyond `footprint`, e.g. a guard post's `side`. */
  readonly meta?: HookMeta;
}

/**
 * What a main route is for: the hull's spine from the dock to the far
 * edge, its branch to the docking ring, the core's causeway, the lane up
 * to the dais, the walkway round the chamber's rim, or a duct the bugs
 * arrive along.
 */
export type PlatformRouteKind =
  "spine" | "branch" | "causeway" | "lane" | "ring" | "duct";

/**
 * A main route: on one level end to end, at least `minWidth` wide and
 * never dressed, so a mech and a 2×2 brute walk it.
 */
export interface PlatformRoute {
  readonly id: string;
  readonly kind: PlatformRouteKind;
  /** Narrowest clear width the carve guarantees along `path`, in tiles. */
  readonly minWidth: number;
  /** Centre line, one column per step. */
  readonly path: readonly ColumnCoord[];
}

/**
 * The plan a spore platform stage was shaped from (#1179), kept on the
 * draft so the dressing, hook and pad passes work from the same plan.
 * Never frozen into the `TacticalMap`: the hooks carry what the finale
 * needs.
 *
 * ```
 *   stage 1, hull                      stage 2, core
 *   ····▓▓▓····   · void (space)       ········▓▓▓········  ▓ start pad (deploy)
 *   ···▓▓D▓▓···   D drop ship dock     ·········║·········  ║ causeway, the only way in
 *   ··▓▓▓║▓▓▓▓·   ║ spine route        ····▒▒▒▒▒║▒▒▒▒▒····  ▒ walkway and berm
 *   ·▓▓▓▓║▓▓(R)   R docking ring       ·═══▒▒▒▒▒D▒▒▒▒▒═══·  D Sovereign's dais
 *   ·▓▓▓▓║▓▓▓▓·   P pod beds           ····▒▒▒▒▒C▒▒▒▒▒····  C core seed, ═ ducts
 *   ·▓▓▓▓X▓▓▓▓·   X hatch to stage 2   ········▒▒▒········
 * ```
 */
export interface PlatformLayout {
  readonly stage: PlatformStage;
  /** Row-major 1 where the column is walkable deck, 0 where it is void. */
  readonly deck: Uint8Array;
  /**
   * Row-major 1 on a main route's band: never dressed, and level across
   * its width, so a mech and a 2×2 brute walk it end to end.
   */
  readonly route: Uint8Array;
  readonly routes: readonly PlatformRoute[];
  /** Row-major 1 where a spawner pod may stand: hull pod beds, core wall niches. */
  readonly podBeds: Uint8Array;
  /** Row-major 1 where the dressing must leave the deck clear (pads and their aprons). */
  readonly keepClear: Uint8Array;
  /** Planned squares for the objective and deploy hooks. */
  readonly pads: readonly PlatformPad[];
  /** Core stage: row-major 1 inside the round chamber. */
  readonly chamber?: Uint8Array;
  /** Core stage: the chamber's centre and radius in tiles. */
  readonly chamberCentre?: ColumnCoord;
  readonly chamberRadius?: number;
}
