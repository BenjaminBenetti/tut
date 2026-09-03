import type { Applied, DomainEvent } from "../../core/model/domain-event";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { CityId } from "./city";
import type { Mission, MissionId } from "./mission";
import type { DeployableId } from "./deployable";
import type { DeployableTypeId } from "./deployable-type";
import type { RegionId } from "./region";

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
// Deployable offline / online
// ===========================================

/** What presentation needs to point at an installation that changed status. */
export interface DeployableStatusPayload {
  readonly deployableId: DeployableId;
  readonly typeId: DeployableTypeId;
  readonly regionId: RegionId;
}

/** Event type emitted when upkeep cannot be paid and an installation stops acting. */
export const DEPLOYABLE_OFFLINE = "overworld:deployable-offline";

/** An installation went offline because its upkeep was unaffordable (GDD §5.6). */
export type DeployableOfflineEvent = DomainEvent<
  typeof DEPLOYABLE_OFFLINE,
  DeployableStatusPayload
>;

/** Event type emitted when an offline installation's upkeep is paid again. */
export const DEPLOYABLE_ONLINE = "overworld:deployable-online";

/** An offline installation came back online because its upkeep was paid. */
export type DeployableOnlineEvent = DomainEvent<
  typeof DEPLOYABLE_ONLINE,
  DeployableStatusPayload
>;

// ===========================================
// Mission offered
// ===========================================

/** Event type emitted when the mission tick attaches a new mission to a city. */
export const MISSION_OFFERED = "overworld:mission-offered";

/** What presentation needs to show a new offer. The whole mission, since it is new data. */
export interface MissionOfferedPayload {
  readonly mission: Mission;
}

/** A mission appeared on the map. */
export type MissionOfferedEvent = DomainEvent<
  typeof MISSION_OFFERED,
  MissionOfferedPayload
>;

// ===========================================
// Mission expired
// ===========================================

/** Event type emitted when an unplayed mission passes its expiry day. */
export const MISSION_EXPIRED = "overworld:mission-expired";

/** What presentation needs to animate a lapsed offer and its penalty. */
export interface MissionExpiredPayload {
  readonly missionId: MissionId;
  readonly typeId: MissionTypeId;
  readonly cityId: CityId;
  /** Infestation added to the host city for ignoring it (before clamping). */
  readonly ignorePenalty: number;
}

/** An unplayed mission lapsed and its host city paid the ignore penalty. */
export type MissionExpiredEvent = DomainEvent<
  typeof MISSION_EXPIRED,
  MissionExpiredPayload
>;

// ===========================================
// Union
// ===========================================

/**
 * Every domain event the overworld can emit, one line per event so the
 * list stays discoverable. Extended by each tick step and command as it
 * lands (#67, #68).
 */
export type OverworldDomainEvent =
  | CityInfestationChangedEvent
  | DayAdvancedEvent
  | ThreatChangedEvent
  | InfestationSpreadEvent
  | InfestationSeededEvent
  | DeployableOfflineEvent
  | DeployableOnlineEvent
  | MissionOfferedEvent
  | MissionExpiredEvent;

/**
 * The `{ state, events }` pair overworld handlers and tick steps return,
 * generic over the state they operate on (a slice or the whole campaign).
 */
export type OverworldApplied<TState> = Applied<TState, OverworldDomainEvent>;
