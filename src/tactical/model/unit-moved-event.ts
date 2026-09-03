import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// UnitMoved
// ===========================================

/** Event type: a unit walked a path. */
export const UNIT_MOVED = "tactical:unit-moved";

/** Payload of `UnitMoved`. */
export interface UnitMovedPayload {
  readonly unitId: UnitId;
  readonly from: TileCoord;
  readonly to: TileCoord;
  /** Every tile stepped through, for the animation. */
  readonly path: readonly TileCoord[];
}

/** A unit walked a path. */
export type UnitMovedEvent = DomainEvent<typeof UNIT_MOVED, UnitMovedPayload>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_MOVED]: UnitMovedEvent;
  }
}
