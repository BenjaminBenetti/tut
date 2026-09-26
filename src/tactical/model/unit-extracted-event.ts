import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// UnitExtracted
// ===========================================

/** Event type: a unit left the map through the extraction zone. */
export const UNIT_EXTRACTED = "tactical:unit-extracted";

/** Payload of `UnitExtracted`. */
export interface UnitExtractedPayload {
  readonly unitId: UnitId;
  /**
   * Squads and mechs still standing on the map after this one left
   * (`isStandingForce`); civilian groups, turrets and generators are not
   * counted.
   */
  readonly remaining: number;
}

/** A unit left the map through the extraction zone (GDD §6.3). */
export type UnitExtractedEvent = DomainEvent<
  typeof UNIT_EXTRACTED,
  UnitExtractedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_EXTRACTED]: UnitExtractedEvent;
  }
}
