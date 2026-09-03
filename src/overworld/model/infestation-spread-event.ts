import type { DomainEvent } from "../../core/model/domain-event";
import type { CityId } from "./city";

// ===========================================
// Infestation spread
// ===========================================

/** Event type emitted when a city pushes infestation into a neighbour. */
export const INFESTATION_SPREAD = "overworld:infestation-spread";

/** What presentation needs to animate a spread along a city link. */
export interface InfestationSpreadPayload {
  /** The city at or above the spread threshold. */
  readonly fromCityId: CityId;
  /** The neighbour that received infestation. */
  readonly toCityId: CityId;
  /** Infestation points actually added to `toCityId`, after clamping. Positive. */
  readonly amount: number;
}

/** A city spread infestation to a neighbour (GDD §5.3). */
export type InfestationSpreadEvent = DomainEvent<
  typeof INFESTATION_SPREAD,
  InfestationSpreadPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [INFESTATION_SPREAD]: InfestationSpreadEvent;
  }
}
