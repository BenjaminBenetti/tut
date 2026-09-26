import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// UnitTunnelled
// ===========================================

/** Event type: a burrowed unit moved under the ground (#1179). */
export const UNIT_TUNNELLED = "tactical:unit-tunnelled";

/** Payload of `UnitTunnelled`. */
export interface UnitTunnelledPayload {
  readonly unitId: UnitId;
  readonly from: TileCoord;
  readonly to: TileCoord;
}

/**
 * A burrowed unit moved under the ground. Deliberately not a
 * `UnitMoved`: the scene walks and places arrivals on those, and
 * nothing on the surface saw this happen. The log and the scene say
 * nothing about it; it is here for the record and for tests.
 */
export type UnitTunnelledEvent = DomainEvent<
  typeof UNIT_TUNNELLED,
  UnitTunnelledPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_TUNNELLED]: UnitTunnelledEvent;
  }
}
