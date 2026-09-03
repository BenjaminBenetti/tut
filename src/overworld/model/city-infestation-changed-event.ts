import type { DomainEvent } from "../../core/model/domain-event";
import type { CityId } from "./city";

// ===========================================
// City infestation changed
// ===========================================

/** Event type emitted when a city's infestation moves. Namespaced for the event bus. */
export const CITY_INFESTATION_CHANGED = "overworld:city-infestation-changed";

/** What presentation needs to animate an infestation change. */
export interface CityInfestationChangedPayload {
  readonly cityId: CityId;
  /** Infestation before the change. */
  readonly from: number;
  /** Infestation after the change. Never equal to `from`. */
  readonly to: number;
}

/** A city's infestation rose or fell. */
export type CityInfestationChangedEvent = DomainEvent<
  typeof CITY_INFESTATION_CHANGED,
  CityInfestationChangedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [CITY_INFESTATION_CHANGED]: CityInfestationChangedEvent;
  }
}
