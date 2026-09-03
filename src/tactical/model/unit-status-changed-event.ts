import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId, UnitStatus } from "./unit";

// ===========================================
// UnitStatusChanged
// ===========================================

/** Event type: a unit's transient statuses changed (went on overwatch, fired its watch, …). */
export const UNIT_STATUS_CHANGED = "tactical:unit-status-changed";

/** Payload of `UnitStatusChanged`. */
export interface UnitStatusChangedPayload {
  readonly unitId: UnitId;
  /** The unit's full status list after the change. */
  readonly status: readonly UnitStatus[];
}

/** A unit's statuses changed; graphics swaps its pose or marker. */
export type UnitStatusChangedEvent = DomainEvent<
  typeof UNIT_STATUS_CHANGED,
  UnitStatusChangedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_STATUS_CHANGED]: UnitStatusChangedEvent;
  }
}
