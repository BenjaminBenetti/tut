import type { DomainEvent } from "../../core/model/domain-event";
import type { MissionResult } from "./mission-result";

// ===========================================
// Mission resolved
// ===========================================

/** Event type emitted once per launched mission, before the sub-service events that apply it. */
export const MISSION_RESOLVED = "overworld:mission-resolved";

/** What the results screen needs: the whole result, since it is new data. */
export interface MissionResolvedPayload {
  readonly result: MissionResult;
}

/** A mission was played out and its result applied (GDD §6.5). */
export type MissionResolvedEvent = DomainEvent<
  typeof MISSION_RESOLVED,
  MissionResolvedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [MISSION_RESOLVED]: MissionResolvedEvent;
  }
}
