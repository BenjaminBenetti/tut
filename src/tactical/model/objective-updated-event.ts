import type { DomainEvent } from "../../core/model/domain-event";

// ===========================================
// ObjectiveUpdated
// ===========================================

/** Event type: an objective's completion changed. */
export const OBJECTIVE_UPDATED = "tactical:objective-updated";

/** Payload of `ObjectiveUpdated`. */
export interface ObjectiveUpdatedPayload {
  readonly objectiveId: string;
  readonly complete: boolean;
}

/** An objective's completion changed. */
export type ObjectiveUpdatedEvent = DomainEvent<
  typeof OBJECTIVE_UPDATED,
  ObjectiveUpdatedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [OBJECTIVE_UPDATED]: ObjectiveUpdatedEvent;
  }
}
