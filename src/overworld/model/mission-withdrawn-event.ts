import type { DomainEvent } from "../../core/model/domain-event";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { CityId } from "./city";
import type { MissionId } from "./mission";

// ===========================================
// Mission withdrawn
// ===========================================

/**
 * Event type emitted when the mission director takes an offer off the
 * board without it being played or ignored (ADR 0013 §2.4, #1179): an
 * ordinary offer displaced by a pinned one, or a triggered offer whose
 * trigger rule's `refresh` withdrew it.
 */
export const MISSION_WITHDRAWN = "overworld:mission-withdrawn";

/**
 * Why a triggered offer was withdrawn by its rule's daily `refresh`:
 * the event behind it is gone (a Hive Assault whose hive no longer
 * stands). A displaced offer carries no reason; `replacedBy` says why.
 */
export type MissionWithdrawnReason = "target-gone";

/** What every withdrawal names: the offer, and the city it stood on. */
interface MissionWithdrawnBase {
  /** The offer taken off the board. */
  readonly missionId: MissionId;
  readonly typeId: MissionTypeId;
  /** The city it stood on. */
  readonly cityId: CityId;
}

/** An ordinary offer taken off its city for a pinned one. */
export interface MissionDisplacedPayload extends MissionWithdrawnBase {
  /** The pinned offer that took its city, which it now holds. */
  readonly replacedBy: MissionId;
  readonly reason?: undefined;
}

/** A triggered offer its rule withdrew because the event behind it is gone. */
export interface MissionLapsedPayload extends MissionWithdrawnBase {
  readonly replacedBy?: undefined;
  /** What the rule's `refresh` withdrew it for. */
  readonly reason: MissionWithdrawnReason;
}

/**
 * What presentation needs to take the offer off the map, and say why:
 * the pinned offer that replaced it, or the reason it lapsed.
 *
 * ```
 *   displaced  { missionId, typeId, cityId, replacedBy }   (a story or Great Hive pin)
 *   lapsed     { missionId, typeId, cityId, reason }       (refresh withdrew it)
 * ```
 */
export type MissionWithdrawnPayload =
  MissionDisplacedPayload | MissionLapsedPayload;

/**
 * An offer was withdrawn. Unlike an expiry it costs nothing: no ignore
 * penalty, and no consequence rule is asked.
 */
export type MissionWithdrawnEvent = DomainEvent<
  typeof MISSION_WITHDRAWN,
  MissionWithdrawnPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [MISSION_WITHDRAWN]: MissionWithdrawnEvent;
  }
}
