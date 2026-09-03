import type { EventType, EventTypeId } from "../model/event-type";
import type { EventTypeCatalogue } from "../model/event-type-catalogue";

// ===========================================
// DataEventTypeCatalogue
// ===========================================

/**
 * `EventTypeCatalogue` backed by an in-memory list of types, normally the
 * values of `EVENT_TYPES` from `overworld/data/event-types.ts`. Duplicate
 * ids are a content bug and are rejected at construction.
 */
export class DataEventTypeCatalogue implements EventTypeCatalogue {
  // ===========================================
  // Fields
  // ===========================================

  private readonly byId: ReadonlyMap<EventTypeId, EventType>;
  private readonly ordered: readonly EventType[];

  // ===========================================
  // Construction
  // ===========================================

  /** Indexes the given types; throws if two share an id. */
  constructor(types: readonly EventType[]) {
    const byId = new Map<EventTypeId, EventType>();
    for (const type of types) {
      if (byId.has(type.id)) {
        throw new Error(`Duplicate event type id "${type.id}"`);
      }
      byId.set(type.id, type);
    }
    this.byId = byId;
    this.ordered = [...types];
  }

  // ===========================================
  // EventTypeCatalogue
  // ===========================================

  /** Returns the type with the given id, or `undefined` if unknown. */
  getEventType(id: EventTypeId): EventType | undefined {
    return this.byId.get(id);
  }

  /** Returns every type in the order they were supplied. */
  listEventTypes(): readonly EventType[] {
    return this.ordered;
  }
}
