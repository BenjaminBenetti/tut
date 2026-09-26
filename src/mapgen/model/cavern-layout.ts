import type { ColumnCoord } from "./road";

// ===========================================
// Hive cavern layout
// ===========================================

/**
 * What a chamber is for on the route from the mouth to the hive core
 * (#1179): the mouth the squad lands in, the chambers the main route
 * passes through, the side pockets off it, and the core at the far end.
 */
export type CavernChamberRole = "mouth" | "route" | "side" | "core";

/** One open chamber of a hive cavern. */
export interface CavernChamber {
  /** `chamber-<index>`; brood-chamber hooks name it in `meta.chamberId`. */
  readonly id: string;
  /** Position in `CavernLayout.chambers`. */
  readonly index: number;
  readonly role: CavernChamberRole;
  /** Where the chamber was planned around; always cavern floor. */
  readonly centre: ColumnCoord;
  /** Planned radius in tiles; lobes and rim noise stray about it. */
  readonly radius: number;
  /** Tunnels between this chamber and the mouth; the mouth is 0. */
  readonly depth: number;
}

/**
 * How a tunnel serves the cavern: the main route strings the route
 * chambers together, a side tunnel reaches a side chamber, and a burrow
 * runs out to the map edge, where bugs arrive.
 */
export type CavernTunnelKind = "main" | "side" | "burrow";

/** A tunnel carved between two chambers, or from a chamber to the edge. */
export interface CavernTunnel {
  readonly id: string;
  readonly kind: CavernTunnelKind;
  /** Chamber index the tunnel starts from. */
  readonly from: number;
  /** Chamber index it ends at; absent for a burrow, which ends at the edge. */
  readonly to?: number;
  /** Narrowest clear width the carve guarantees, in tiles. */
  readonly minWidth: number;
  /** Centre line, one column per step, from `from` to the far end. */
  readonly path: readonly ColumnCoord[];
}

/**
 * The plan a hive cavern was carved from (#1179), kept on the draft so
 * later passes dress chambers, place hooks per chamber and keep the main
 * route clear. Never frozen into the `TacticalMap`: hooks carry what the
 * mission needs (`meta.chamberId`).
 *
 * ```
 *   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓      ▓ bedrock (raised, impassable)
 *   ▓▓▓ mouth ▓▓▓▓▓▓      the squad lands at the mouth, the main route
 *   ▓▓▓▓▓ ║ ▓▓▓ side      winds through the route chambers to the core;
 *   ▓▓▓ route ═══╝ ▓      side tunnels and burrows branch off it
 *   ▓▓▓▓▓▓ ║ ▓▓▓▓▓▓
 *   ▓▓▓▓ core ═══════     burrow to the edge
 * ```
 */
export interface CavernLayout {
  /** Mouth first, then the route in order, the core, then side chambers. */
  readonly chambers: readonly CavernChamber[];
  readonly tunnels: readonly CavernTunnel[];
  /** Row-major chamber index per column; -1 for tunnels and rock. */
  readonly chamberOf: Int16Array;
  /** Row-major 1 where the column is cavern floor, 0 where it is rock. */
  readonly open: Uint8Array;
  /**
   * Row-major 1 on the level spine: the main route, burrows, the mouth
   * and the core pad, all on one level so a 2×2 brute walks it end to end.
   */
  readonly spine: Uint8Array;
  /** The level the spine sits on. */
  readonly spineLevel: number;
  /** The flat square the hive core stands on, by its lowest corner. */
  readonly corePad: {
    readonly x: number;
    readonly z: number;
    readonly size: number;
  };
}
