import type { DomainEvent } from "../../core/model/domain-event";

// ===========================================
// DropShipDeparted
// ===========================================

/** Event type: Dust-off Window's drop ship left once its last turn ended. */
export const DROP_SHIP_DEPARTED = "tactical:drop-ship-departed";

/** Payload of `DropShipDeparted`. */
export interface DropShipDepartedPayload {
  /** The last turn the ship waited through: the mission's `dustOffTurn`. */
  readonly turn: number;
  /** How many of the force were still on the map and are lost with it. */
  readonly leftBehind: number;
}

/**
 * The drop ship left (campaign arc §11, Dust-off Window): the turn it
 * waited through has ended. Every unit of the force still on the map
 * follows in one `UnitAbandoned` each, and the mission ends on whoever
 * boarded in time.
 *
 * ```
 *   turn dustOffTurn ends ──► DropShipDeparted ──► UnitAbandoned × leftBehind ──► MissionEnded
 * ```
 */
export type DropShipDepartedEvent = DomainEvent<
  typeof DROP_SHIP_DEPARTED,
  DropShipDepartedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [DROP_SHIP_DEPARTED]: DropShipDepartedEvent;
  }
}
