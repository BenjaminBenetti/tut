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
// Infestation seeded
// ===========================================

/** Event type emitted when a clean city gains a fresh infestation. */
export const INFESTATION_SEEDED = "overworld:infestation-seeded";

/** What presentation needs to animate a new landing. */
export interface InfestationSeededPayload {
  /** The city that was clean and is now infested. */
  readonly cityId: CityId;
}

/** A clean city was seeded with a new infestation (GDD §5.3). */
export type InfestationSeededEvent = DomainEvent<
  typeof INFESTATION_SEEDED,
  InfestationSeededPayload
>;

// ===========================================
// Union
// ===========================================

/**
 * Every domain event the overworld can emit. Extended by each tick step
 * and command as it lands (#55, #61, #68).
 */
export type OverworldDomainEvent =
  CityInfestationChangedEvent | InfestationSpreadEvent | InfestationSeededEvent;
