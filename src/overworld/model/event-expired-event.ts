import type { DomainEvent } from "../../core/model/domain-event";
import type { CityId } from "./city";
import type { EventChoiceId, EventTypeId } from "./event-type";
import type { PendingEventId } from "./pending-event";

// ===========================================
// Event expired
// ===========================================

/** Event type emitted when an unanswered event lapses and resolves itself. */
export const EVENT_EXPIRED = "overworld:event-expired";

/** What presentation needs to narrate a lapsed event. */
export interface EventExpiredPayload {
  readonly eventId: PendingEventId;
  readonly typeId: EventTypeId;
  /** The attached city, when the type required one. */
  readonly cityId?: CityId;
  /**
   * The choice whose effects were applied on expiry. Absent when no
   * choice could be afforded and the event lapsed without effect.
   */
  readonly choiceId?: EventChoiceId;
}

/** An unanswered event expired; its default choice was applied (GDD §5.4). */
export type EventExpiredEvent = DomainEvent<
  typeof EVENT_EXPIRED,
  EventExpiredPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [EVENT_EXPIRED]: EventExpiredEvent;
  }
}
