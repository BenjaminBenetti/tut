import type { DomainEvent } from "../../core/model/domain-event";
import type { TacticalPhase } from "./tactical-state";

// ===========================================
// TurnStarted
// ===========================================

/** Event type: a new turn or phase began. */
export const TURN_STARTED = "tactical:turn-started";

/** Payload of `TurnStarted`. */
export interface TurnStartedPayload {
  readonly turn: number;
  readonly phase: TacticalPhase;
}

/** A new turn or phase began. */
export type TurnStartedEvent = DomainEvent<
  typeof TURN_STARTED,
  TurnStartedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [TURN_STARTED]: TurnStartedEvent;
  }
}
