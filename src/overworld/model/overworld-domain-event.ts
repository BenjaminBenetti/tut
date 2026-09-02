import type { DomainEvent } from "../../core/model/domain-event";
import type { CityId } from "./city";

// ===========================================
// City infestation changed
// ===========================================
//
// "Event" is overloaded in this domain: `EventType` (event-type.ts) is a
// GDD §5.4 happening the player answers with a choice. The types in this
// file are ADR 0003 domain events: plain facts about what a tick or a
// command changed, emitted for presentation to animate.

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
// Union
// ===========================================

/**
 * Every domain event the overworld can emit. Extended by each tick step
 * and command as it lands (#55, #58, #61, #68).
 */
export type OverworldDomainEvent = CityInfestationChangedEvent;
