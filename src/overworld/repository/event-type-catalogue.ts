import type { Registry } from "../../core/model/registry";
import { createRegistry } from "../../core/service/definition-registry";
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

  private readonly registry: Registry<EventType>;

  // ===========================================
  // Construction
  // ===========================================

  /** Indexes the given types; throws if two share an id. */
  constructor(types: readonly EventType[]) {
    this.registry = createRegistry("event type", types);
  }

  // ===========================================
  // EventTypeCatalogue
  // ===========================================

  /** Returns the type with the given id, or `undefined` if unknown. */
  getEventType(id: EventTypeId): EventType | undefined {
    return this.registry.find(id);
  }

  /** Returns every type in the order they were supplied. */
  listEventTypes(): readonly EventType[] {
    return this.registry.values;
  }
}
