import type { ActId } from "../../content/model/act-id";
import type { DomainEvent } from "../../core/model/domain-event";

// ===========================================
// Act advanced
// ===========================================

/** Event type emitted when the campaign moves into its next act. */
export const ACT_ADVANCED = "overworld:act-advanced";

/** What presentation needs to announce the new act. */
export interface ActAdvancedPayload {
  readonly from: ActId;
  readonly to: ActId;
}

/**
 * The story spine opened a new act (ADR 0013 §2.5): the gate mission of
 * `from` was won and `to` exists. Not emitted when the spine ends in
 * victory instead.
 */
export type ActAdvancedEvent = DomainEvent<
  typeof ACT_ADVANCED,
  ActAdvancedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [ACT_ADVANCED]: ActAdvancedEvent;
  }
}
