import type { CityId } from "./city";
import type { EventTypeId } from "./event-type";

// ===========================================
// Ids
// ===========================================

/** Id of a pending event instance, e.g. `"event-3"`. Plain string (ADR 0003). */
export type PendingEventId = string;

/** Prefix the id generator uses for event instances. */
export const PENDING_EVENT_ID_PREFIX = "event";

// ===========================================
// Pending event
// ===========================================

/**
 * One non-combat event awaiting the player's choice (GDD §5.4). Its
 * text, choices and effects come from the `EventType` it references;
 * this record only says which type, which city (when the type requires
 * one), and how long the player has. Lives in
 * `OverworldState.pendingEvents` until resolved or expired.
 *
 * ```
 *   EventType (catalogue)          PendingEvent (this)
 *   ┌─────────────────────┐        ┌────────────────────────────┐
 *   │ id: "city-plea"     │◄───────│ typeId                     │
 *   │ requiresCity: true  │        │ cityId  (set iff required) │
 *   │ choices[]           │        │ createdDay, expiresDay     │
 *   └─────────────────────┘        └────────────────────────────┘
 * ```
 */
export interface PendingEvent {
  /** Unique within the campaign. */
  readonly id: PendingEventId;
  /** Catalogue entry that defines the text, choices and effects. */
  readonly typeId: EventTypeId;
  /** The attached city; present exactly when the type has `requiresCity`. */
  readonly cityId?: CityId;
  /** Overworld day the event appeared. */
  readonly createdDay: number;
  /**
   * First day on which the event is gone unanswered: it can be resolved
   * while `createdDay <= day < expiresDay`. Always after `createdDay`.
   */
  readonly expiresDay: number;
}
