import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// UnitBurrowed
// ===========================================

/** Event type: a surfaced burrower dug back under the ground (#1179). */
export const UNIT_BURROWED = "tactical:unit-burrowed";

/** Payload of `UnitBurrowed`. */
export interface UnitBurrowedPayload {
  readonly unitId: UnitId;
  /** The tile it went down through. */
  readonly pos: TileCoord;
}

/**
 * A burrower went back down. The scene sinks it into a burst of earth
 * before the redraw takes it away, since from here on the other side
 * cannot see it.
 */
export type UnitBurrowedEvent = DomainEvent<
  typeof UNIT_BURROWED,
  UnitBurrowedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_BURROWED]: UnitBurrowedEvent;
  }
}
