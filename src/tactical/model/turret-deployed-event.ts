import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// TurretDeployed
// ===========================================

/** Event type: a turret came to stand on the map (#1138, #1155). */
export const TURRET_DEPLOYED = "tactical:turret-deployed";

/** Payload of `TurretDeployed`. */
export interface TurretDeployedPayload {
  /**
   * The unit that deployed it. Absent for a garrison turret (#1155),
   * which nobody deployed: it was standing when the mission opened.
   */
  readonly unitId?: UnitId;
  /** The turret, now a unit of its own in `units`. */
  readonly turretId: UnitId;
  readonly tile: TileCoord;
  /** Player turns of battery it starts with; absent for a turret on mains (#1155). */
  readonly turnsLeft?: number;
  /** Reaction shots each of its overwatches fires. */
  readonly overwatchShots: number;
}

/**
 * A turret came to stand on a tile and is on overwatch from this
 * moment: a squad put it down, or the region's garrison had it there
 * when the mission opened (#1155).
 */
export type TurretDeployedEvent = DomainEvent<
  typeof TURRET_DEPLOYED,
  TurretDeployedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [TURRET_DEPLOYED]: TurretDeployedEvent;
  }
}
