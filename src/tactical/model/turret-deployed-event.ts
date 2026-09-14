import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// TurretDeployed
// ===========================================

/** Event type: an engineer put a turret down (#1138). */
export const TURRET_DEPLOYED = "tactical:turret-deployed";

/** Payload of `TurretDeployed`. */
export interface TurretDeployedPayload {
  /** The unit that deployed it. */
  readonly unitId: UnitId;
  /** The turret, now a unit of its own in `units`. */
  readonly turretId: UnitId;
  readonly tile: TileCoord;
  /** Player turns of battery it starts with. */
  readonly turnsLeft: number;
  /** Reaction shots each of its overwatches fires. */
  readonly overwatchShots: number;
}

/** A squad put a turret on a tile; it is on overwatch from this moment. */
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
