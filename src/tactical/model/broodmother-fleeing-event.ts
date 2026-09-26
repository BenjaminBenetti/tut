import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// BroodmotherFleeing
// ===========================================

/** Event type: a Broodmother is down to half health and has turned for the map edge. */
export const BROODMOTHER_FLEEING = "tactical:broodmother-fleeing";

/** Payload of `BroodmotherFleeing`. */
export interface BroodmotherFleeingPayload {
  /** The Broodmother. */
  readonly unitId: UnitId;
  /** Her hit points when she turned. */
  readonly hp: number;
  /** Her max hit points. */
  readonly maxHp: number;
}

/**
 * A Broodmother has turned to flee (#1179, campaign arc §6.8): at or
 * below half health she runs for the nearest map edge, and one that
 * reaches it escapes. Announced once, as the first phase after the
 * wound opens.
 */
export type BroodmotherFleeingEvent = DomainEvent<
  typeof BROODMOTHER_FLEEING,
  BroodmotherFleeingPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [BROODMOTHER_FLEEING]: BroodmotherFleeingEvent;
  }
}
