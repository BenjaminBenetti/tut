import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// ChargeDetonated
// ===========================================

/** Event type: a placed charge went off (#1132); its blast follows in `BlastResolved`. */
export const CHARGE_DETONATED = "tactical:charge-detonated";

/** Payload of `ChargeDetonated`. */
export interface ChargeDetonatedPayload {
  readonly chargeId: string;
  /** The unit that placed it, credited with whatever the blast kills. */
  readonly ownerId: UnitId;
  readonly tile: TileCoord;
}

/** A charge detonated as the player's turn opened. */
export type ChargeDetonatedEvent = DomainEvent<
  typeof CHARGE_DETONATED,
  ChargeDetonatedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [CHARGE_DETONATED]: ChargeDetonatedEvent;
  }
}
