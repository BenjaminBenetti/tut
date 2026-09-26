import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// CiviliansKilled
// ===========================================

/** Event type: a civilian group was taken to zero hit points. */
export const CIVILIANS_KILLED = "tactical:civilians-killed";

/**
 * Payload of `CiviliansKilled` (campaign arc §6.4). A group gets this
 * rather than a `UnitDied`, as a turret gets `TurretDestroyed`: the
 * debrief has no roster entry to mourn and nobody earns a kill.
 */
export interface CiviliansKilledPayload {
  readonly unitId: UnitId;
  readonly pos: TileCoord;
  /** Whoever dealt the blow, when a unit did. */
  readonly killerId?: UnitId;
}

/** A civilian group died. */
export type CiviliansKilledEvent = DomainEvent<
  typeof CIVILIANS_KILLED,
  CiviliansKilledPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [CIVILIANS_KILLED]: CiviliansKilledEvent;
  }
}
