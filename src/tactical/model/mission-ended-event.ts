import type { DomainEvent } from "../../core/model/domain-event";
import type { MissionOutcome } from "../../overworld/model/mission-result";

// ===========================================
// MissionEnded
// ===========================================

/** Event type: the mission is over (GDD §6.5). */
export const MISSION_ENDED = "tactical:mission-ended";

/** Payload of `MissionEnded`. */
export interface MissionEndedPayload {
  readonly outcome: MissionOutcome;
  /** The turn the mission ended on. */
  readonly turn: number;
}

/** The mission is over (GDD §6.5). */
export type MissionEndedEvent = DomainEvent<
  typeof MISSION_ENDED,
  MissionEndedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [MISSION_ENDED]: MissionEndedEvent;
  }
}
