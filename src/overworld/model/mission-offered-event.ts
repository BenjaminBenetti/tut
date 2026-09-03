import type { DomainEvent } from "../../core/model/domain-event";
import type { Mission } from "./mission";

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
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [MISSION_OFFERED]: MissionOfferedEvent;
  }
}
