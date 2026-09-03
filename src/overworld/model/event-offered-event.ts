import type { DomainEvent } from "../../core/model/domain-event";
import type { PendingEvent } from "./pending-event";

// ===========================================
// Event offered
// ===========================================

/** Event type emitted when the day tick raises a new pending event. */
export const EVENT_OFFERED = "overworld:event-offered";

/** What presentation needs to open the dialog. The whole record, since it is new data. */
export interface EventOfferedPayload {
  readonly event: PendingEvent;
}

/** A non-combat event appeared and awaits a choice (GDD §5.4). */
export type EventOfferedEvent = DomainEvent<
  typeof EVENT_OFFERED,
  EventOfferedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [EVENT_OFFERED]: EventOfferedEvent;
  }
}
