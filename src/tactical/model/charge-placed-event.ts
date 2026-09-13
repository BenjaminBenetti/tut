import type { DomainEvent } from "../../core/model/domain-event";
import type { PlacedCharge } from "./equipment";

// ===========================================
// ChargePlaced
// ===========================================

/** Event type: a breaching charge was set on a tile (#1132). */
export const CHARGE_PLACED = "tactical:charge-placed";

/** Payload of `ChargePlaced`: the charge as it now sits in the mission. */
export interface ChargePlacedPayload {
  readonly charge: PlacedCharge;
}

/** A charge was placed and is counting down. */
export type ChargePlacedEvent = DomainEvent<
  typeof CHARGE_PLACED,
  ChargePlacedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [CHARGE_PLACED]: ChargePlacedEvent;
  }
}
