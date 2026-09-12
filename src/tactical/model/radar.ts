import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Team } from "./unit";

/** A stationary scanner that operates until the mission ends. */
export interface Radar {
  readonly id: string;
  readonly team: Team;
  readonly pos: TileCoord;
  /** Horizontal circular radius in tiles; terrain does not block the scan. */
  readonly range: number;
}

/** Location-only intel: no species, health, or attack target is disclosed. */
export interface RadarContact {
  readonly kind: "unit" | "structure";
  readonly pos: TileCoord;
}

/** Deployment and scanning balance, injected into the action rules. */
export interface RadarTuning {
  readonly apCost: number;
  readonly deployRange: number;
  readonly scanRange: number;
}
