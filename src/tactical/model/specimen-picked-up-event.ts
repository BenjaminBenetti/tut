import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { CarriedSpecimen } from "./carried-specimen";
import type { UnitId } from "./unit";

// ===========================================
// SpecimenPickedUp
// ===========================================

/** Event type: a squad picked up the specimen a fallen carrier dropped (#1179). */
export const SPECIMEN_PICKED_UP = "tactical:specimen-picked-up";

/** Payload of `SpecimenPickedUp`: who took it, from whom, and where. */
export interface SpecimenPickedUpPayload {
  /** The squad that picked it up and now carries it. */
  readonly unitId: UnitId;
  /** The fallen carrier it was lying beside. */
  readonly fromUnitId: UnitId;
  readonly specimen: CarriedSpecimen;
  /** The tile it lay on: where the carrier fell. */
  readonly pos: TileCoord;
}

/** A dropped specimen changed hands: a living squad carries it again. */
export type SpecimenPickedUpEvent = DomainEvent<
  typeof SPECIMEN_PICKED_UP,
  SpecimenPickedUpPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [SPECIMEN_PICKED_UP]: SpecimenPickedUpEvent;
  }
}
