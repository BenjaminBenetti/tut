import type { EventType, EventTypeId } from "./event-type";

/**
 * Read-only lookup of event types. Services (resolution, generation)
 * depend on this interface rather than on the data module so tests can
 * supply a fixture catalogue and content can be swapped without touching
 * logic (ADR 0003 §2.5).
 */
export interface EventTypeCatalogue {
  /** Returns the type with the given id, or `undefined` if unknown. */
  getEventType(id: EventTypeId): EventType | undefined;

  /** Returns every type in catalogue order. */
  listEventTypes(): readonly EventType[];
}
