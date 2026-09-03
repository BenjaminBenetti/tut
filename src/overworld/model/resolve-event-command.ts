import type { Command } from "../../core/model/command";
import type { EventChoiceId } from "./event-type";
import type { PendingEventId } from "./pending-event";

// ===========================================
// Resolve event
// ===========================================

/** Command type that answers a pending event with one of its choices (GDD §5.4). */
export const RESOLVE_EVENT = "overworld:resolve-event";

/** Which event and which of its choices. */
export interface ResolveEventPayload {
  readonly eventId: PendingEventId;
  readonly choiceId: EventChoiceId;
}

/** Applies the chosen effects and removes the event. */
export type ResolveEventCommand = Command<
  typeof RESOLVE_EVENT,
  ResolveEventPayload
>;

/** Builds a `ResolveEvent` command. */
export function resolveEvent(
  eventId: PendingEventId,
  choiceId: EventChoiceId,
): ResolveEventCommand {
  return { type: RESOLVE_EVENT, payload: { eventId, choiceId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [RESOLVE_EVENT]: ResolveEventCommand;
  }
}
