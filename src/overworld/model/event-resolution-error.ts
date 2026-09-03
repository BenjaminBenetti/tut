import type { EventChoiceId, EventTypeId } from "./event-type";
import type { PendingEventId } from "./pending-event";

// ===========================================
// Errors
// ===========================================

/** The command named an event that is not pending. */
export interface UnknownEventError {
  readonly code: "unknown-event";
  readonly eventId: PendingEventId;
}

/** A pending event references a type the catalogue lacks. */
export interface UnknownEventTypeError {
  readonly code: "unknown-event-type";
  readonly eventId: PendingEventId;
  readonly typeId: EventTypeId;
}

/** The command named a choice the event's type does not offer. */
export interface UnknownChoiceError {
  readonly code: "unknown-choice";
  readonly eventId: PendingEventId;
  readonly choiceId: EventChoiceId;
}

/** A choice charges more than the treasury holds. Mirrors the economy's error. */
export interface EventInsufficientCreditsError {
  readonly code: "insufficient-credits";
  readonly required: number;
  readonly available: number;
}

/**
 * Why a `ResolveEvent` was rejected. Plain data discriminated on `code`
 * so a handler can fold it into a `CommandError`.
 *
 * | code                   | cause                                   |
 * |------------------------|-----------------------------------------|
 * | `unknown-event`        | no pending event with that id           |
 * | `unknown-event-type`   | catalogue lacks the event's type        |
 * | `unknown-choice`       | the type offers no such choice          |
 * | `insufficient-credits` | a `credits` effect could not be covered |
 */
export type EventResolutionError =
  | UnknownEventError
  | UnknownEventTypeError
  | UnknownChoiceError
  | EventInsufficientCreditsError;

// ===========================================
// Messages
// ===========================================

/** Renders an error as one human-readable sentence for the UI or a log. */
export function describeEventResolutionError(
  error: EventResolutionError,
): string {
  switch (error.code) {
    case "unknown-event":
      return `No pending event "${error.eventId}"`;
    case "unknown-event-type":
      return `Event "${error.eventId}" has unknown type "${error.typeId}"`;
    case "unknown-choice":
      return `Event "${error.eventId}" offers no choice "${error.choiceId}"`;
    case "insufficient-credits":
      return `Need ${String(error.required)} credits, have ${String(error.available)}`;
  }
}
