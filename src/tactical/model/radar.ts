import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Team } from "./unit";

// ===========================================
// Radar
// ===========================================

/**
 * A stationary scanner a radio squad put down (GDD §6.2.1). It runs on
 * a battery (#1130): `turnsLeft` counts the player turns of charge it
 * has, drains as each player turn opens, and at zero the scanner is
 * burnt out — the model stays on the map, smoking, but it scans
 * nothing and its dish no longer turns.
 *
 * ```
 *   deployed on turn T, batteryTurns 3
 *
 *   turn   T      T+1    T+2    T+3
 *   left   3      2      1      0  ──► RadarBurnedOut, no contacts
 * ```
 */
export interface Radar {
  readonly id: string;
  readonly team: Team;
  readonly pos: TileCoord;
  /** Horizontal circular radius in tiles; terrain does not block the scan. */
  readonly range: number;
  /** Player turns of battery left; drains as each player turn opens. `0` is burnt out. Non-negative integer. */
  readonly turnsLeft: number;
}

/** Location-only intel: no species, health, or attack target is disclosed. */
export interface RadarContact {
  readonly kind: "unit" | "structure";
  readonly pos: TileCoord;
}

/** Deployment and scanning balance, injected into the action rules. */
export interface RadarTuning {
  readonly apCost: number;
  /** Straight-line tiles from the squad a scanner may be placed, on the ground plane. */
  readonly deployRange: number;
  readonly scanRange: number;
  /** Player turns a fresh scanner runs before its battery dies (#1130). Positive integer. */
  readonly batteryTurns: number;
}

// ===========================================
// Helpers
// ===========================================

/**
 * True while the scanner's battery has charge: it reports contacts and
 * its dish turns. The one predicate the rules and the renderer share,
 * so "burnt out" is answered in one place.
 */
export function radarIsActive(radar: Radar): boolean {
  return radar.turnsLeft > 0;
}
