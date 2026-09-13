import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// UnitAbandoned
// ===========================================

/** Event type: a TDF unit was left behind when the player abandoned the mission (#1132). */
export const UNIT_ABANDONED = "tactical:unit-abandoned";

/** Payload of `UnitAbandoned`. */
export interface UnitAbandonedPayload {
  /** The unit left on the map; its roster entry is gone with it. */
  readonly unitId: UnitId;
}

/**
 * A unit was left behind (GDD §6.3). Distinct from `UnitDied`: nobody
 * killed it and nobody is credited, but the roster reads it as wiped or
 * destroyed all the same, and the debrief names it as left behind rather
 * than as a casualty.
 */
export type UnitAbandonedEvent = DomainEvent<
  typeof UNIT_ABANDONED,
  UnitAbandonedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_ABANDONED]: UnitAbandonedEvent;
  }
}
