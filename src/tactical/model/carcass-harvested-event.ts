import type { DomainEvent } from "../../core/model/domain-event";
import type { TechCarcassId } from "./tech-carcass";
import type { UnitId } from "./unit";

// ===========================================
// CarcassHarvested
// ===========================================

/** Event type: a squad stripped a tech carcass (#1171). */
export const CARCASS_HARVESTED = "tactical:carcass-harvested";

/** Payload of `CarcassHarvested`. */
export interface CarcassHarvestedPayload {
  readonly unitId: UnitId;
  readonly carcassId: TechCarcassId;
  /** Whole tech points the carcass was worth; the resolver tallies these. */
  readonly techPoints: number;
}

/** A squad stripped a tech carcass; its points ride home with a win or an extraction. */
export type CarcassHarvestedEvent = DomainEvent<
  typeof CARCASS_HARVESTED,
  CarcassHarvestedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [CARCASS_HARVESTED]: CarcassHarvestedEvent;
  }
}
