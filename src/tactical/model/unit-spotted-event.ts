import type { DomainEvent } from "../../core/model/domain-event";
import type { Team, UnitId } from "./unit";

// ===========================================
// UnitSpotted
// ===========================================

/** Event type: a side has caught sight of an enemy it could not see. */
export const UNIT_SPOTTED = "tactical:unit-spotted";

/** Payload of `UnitSpotted`. */
export interface UnitSpottedPayload {
  /** The side that can now see it. */
  readonly team: Team;
  /** The enemy that came into view. */
  readonly unitId: UnitId;
}

/**
 * A side has caught sight of an enemy (ADR 0006 §2.2). The renderer
 * animates a reveal from it and the log reads "Contact"; a spot is a
 * moment in the mission rather than a diff the scene has to notice.
 */
export type UnitSpottedEvent = DomainEvent<
  typeof UNIT_SPOTTED,
  UnitSpottedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_SPOTTED]: UnitSpottedEvent;
  }
}
