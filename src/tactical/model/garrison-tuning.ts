import type { TurretTuning } from "./turret";

// ===========================================
// Garrison tuning
// ===========================================

/**
 * How a region's defensive batteries reach a mission map (#1155): the
 * turret each one is, and how the mission start spreads them. The
 * count is the overworld's (`garrisonTurrets` on the mission start
 * options); this is everything else.
 *
 * ```
 *   candidates = walkable tiles reachable from the deploy zone
 *                − deploy zone + deployClearance
 *                − live spawners + spawnerClearance
 *                − edge-spawn and extraction hooks
 *                − tiles held by units
 *   sites      = draw uniformly, keep one only if ≥ spacing from every site kept
 * ```
 */
export interface GarrisonTuning {
  /** The turret every garrison battery stands as; on mains, so no `batteryTurns`. */
  readonly turret: TurretTuning;
  /** Least Manhattan distance between two garrison turrets. Positive integer. */
  readonly spacing: number;
  /** Least Manhattan distance from a garrison turret to a live spawner. Non-negative integer. */
  readonly spawnerClearance: number;
  /** Least Manhattan distance from a garrison turret to any deploy-zone tile. Non-negative integer. */
  readonly deployClearance: number;
}
