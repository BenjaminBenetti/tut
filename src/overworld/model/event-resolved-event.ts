import type { DomainEvent } from "../../core/model/domain-event";
import type { CityId } from "./city";
import type { EventChoiceId, EventTypeId } from "./event-type";
import type { PendingEventId } from "./pending-event";

// ===========================================
// Event resolved
// ===========================================

/** Event type emitted when the player answers a pending event. */
export const EVENT_RESOLVED = "overworld:event-resolved";

/** What presentation needs to close the dialog and narrate the choice. */
export interface EventResolvedPayload {
  readonly eventId: PendingEventId;
  readonly typeId: EventTypeId;
  readonly choiceId: EventChoiceId;
  /** The attached city, when the type required one. */
  readonly cityId?: CityId;
}

/** A pending event was answered and its effects applied (GDD §5.4). */
export type EventResolvedEvent = DomainEvent<
  typeof EVENT_RESOLVED,
  EventResolvedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [EVENT_RESOLVED]: EventResolvedEvent;
  }
}
