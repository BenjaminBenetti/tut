import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// UnitDied
// ===========================================

/** Event type: a unit reached zero hit points. */
export const UNIT_DIED = "tactical:unit-died";

/** Payload of `UnitDied`. */
export interface UnitDiedPayload {
  readonly unitId: UnitId;
  /** Who dealt the killing blow, if a unit did. */
  readonly killerId?: UnitId;
}

/** A unit reached zero hit points. */
export type UnitDiedEvent = DomainEvent<typeof UNIT_DIED, UnitDiedPayload>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_DIED]: UnitDiedEvent;
  }
}
