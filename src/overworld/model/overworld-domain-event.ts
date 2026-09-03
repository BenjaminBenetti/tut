import type { Applied, DomainEvent } from "../../core/model/domain-event";
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
// Day advanced
// ===========================================

/** Event type emitted once per `AdvanceDay` after the tick pipeline ran. */
export const DAY_ADVANCED = "overworld:day-advanced";

/** What presentation needs to animate the calendar. */
export interface DayAdvancedPayload {
  /** Day before the tick. */
  readonly from: number;
  /** Day after the tick. Always `from + 1`. */
  readonly to: number;
}

/** The campaign moved one day forward. */
export type DayAdvancedEvent = DomainEvent<
  typeof DAY_ADVANCED,
  DayAdvancedPayload
>;

// ===========================================
// Threat changed
// ===========================================

/** Event type emitted when the stored global threat level moves. */
export const THREAT_CHANGED = "overworld:threat-changed";

/** What presentation needs to animate the threat gauge. */
export interface ThreatChangedPayload {
  /** Threat before the recompute. */
  readonly from: number;
  /** Threat after the recompute. Never equal to `from`. */
  readonly to: number;
}

/** The global threat level rose or fell. */
export type ThreatChangedEvent = DomainEvent<
  typeof THREAT_CHANGED,
  ThreatChangedPayload
>;

// ===========================================
// Union
// ===========================================

/**
 * Every domain event the overworld can emit, one line per event so the
 * list stays discoverable. Extended by each tick step and command as it
 * lands (#58, #61, #67, #68).
 */
export type OverworldDomainEvent =
  CityInfestationChangedEvent | DayAdvancedEvent | ThreatChangedEvent;

/**
 * The `{ state, events }` pair overworld handlers and tick steps return,
 * generic over the state they operate on (a slice or the whole campaign).
 */
export type OverworldApplied<TState> = Applied<TState, OverworldDomainEvent>;
