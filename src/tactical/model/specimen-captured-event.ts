import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { CarriedSpecimen } from "./carried-specimen";
import type { UnitId } from "./unit";

// ===========================================
// SpecimenCaptured
// ===========================================

/** Event type: a squad netted a weakened bug and now carries it (#1179). */
export const SPECIMEN_CAPTURED = "tactical:specimen-captured";

/** Payload of `SpecimenCaptured`: who caught what, and where the bug was. */
export interface SpecimenCapturedPayload {
  /** The squad that threw the net and now carries the catch. */
  readonly unitId: UnitId;
  /** The catch as its carrier holds it; `specimen.unitId` is the bug that left the map. */
  readonly specimen: CarriedSpecimen;
  /** The tile the bug stood on when the net came down. */
  readonly pos: TileCoord;
}

/** A bug was taken alive: it has left the map and rides on its captor. */
export type SpecimenCapturedEvent = DomainEvent<
  typeof SPECIMEN_CAPTURED,
  SpecimenCapturedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [SPECIMEN_CAPTURED]: SpecimenCapturedEvent;
  }
}
