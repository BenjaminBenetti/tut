import type { DomainEvent } from "../../core/model/domain-event";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { CityId } from "./city";
import type { MissionId } from "./mission";

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
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [MISSION_EXPIRED]: MissionExpiredEvent;
  }
}
