import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// TurretBurnedOut
// ===========================================

/** Event type: a turret's battery ran out (#1138). */
export const TURRET_BURNED_OUT = "tactical:turret-burned-out";

/** Payload of `TurretBurnedOut`. */
export interface TurretBurnedOutPayload {
  readonly turretId: UnitId;
  /** Where the dead turret stands; its husk stays on the map. */
  readonly pos: TileCoord;
}

/**
 * A turret's battery ran down as a player turn opened (#1138). Not a
 * `UnitDied`: nobody killed it, nothing is credited, and the debrief
 * has nothing to mourn.
 */
export type TurretBurnedOutEvent = DomainEvent<
  typeof TURRET_BURNED_OUT,
  TurretBurnedOutPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [TURRET_BURNED_OUT]: TurretBurnedOutEvent;
  }
}
