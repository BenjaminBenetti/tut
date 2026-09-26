import type { DomainEvent } from "../../core/model/domain-event";
import type { CarriedSpecimen } from "./carried-specimen";
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
  /**
   * The specimen the unit was carrying (#1179), which now lies on its
   * tile for another squad to pick up. Absent for a unit that carried
   * nothing, so every other death reads exactly as before.
   */
  readonly dropped?: CarriedSpecimen;
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
