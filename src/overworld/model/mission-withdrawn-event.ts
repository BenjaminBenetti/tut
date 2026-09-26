import type { DomainEvent } from "../../core/model/domain-event";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { CityId } from "./city";
import type { MissionId } from "./mission";

// ===========================================
// Mission withdrawn
// ===========================================

/**
 * Event type emitted when the mission director takes an ordinary offer
 * off the board to make room for a pinned one (ADR 0013 §2.4, #1179).
 */
export const MISSION_WITHDRAWN = "overworld:mission-withdrawn";

/** What presentation needs to take the offer off the map, and say why. */
export interface MissionWithdrawnPayload {
  /** The offer taken off the board. */
  readonly missionId: MissionId;
  readonly typeId: MissionTypeId;
  /** The city it stood on, which the pinned offer now holds. */
  readonly cityId: CityId;
  /** The pinned offer that took its city. */
  readonly replacedBy: MissionId;
}

/**
 * An ordinary offer was withdrawn for a pinned one. Unlike an expiry it
 * costs nothing: no ignore penalty, and no consequence rule is asked.
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
