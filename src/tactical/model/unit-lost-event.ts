import type { DomainEvent } from "../../core/model/domain-event";
import type { Team, UnitId } from "./unit";

// ===========================================
// UnitLost
// ===========================================

/** Event type: a side has lost sight of an enemy it could see. */
export const UNIT_LOST = "tactical:unit-lost";

/** Payload of `UnitLost`. */
export interface UnitLostPayload {
  /** The side that can no longer see it. */
  readonly team: Team;
  /** The enemy that went out of view. */
  readonly unitId: UnitId;
}

/**
 * A side has lost sight of an enemy (ADR 0006 §2.2). Paired with
 * `UnitSpotted` so the renderer can take a token off the map on the same
 * signal it put one on, rather than inferring the removal.
 */
export type UnitLostEvent = DomainEvent<typeof UNIT_LOST, UnitLostPayload>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_LOST]: UnitLostEvent;
  }
}
