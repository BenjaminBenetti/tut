import type { DomainEvent } from "../../core/model/domain-event";
import type { BroodId, BroodWakeCause } from "./brood";
import type { UnitId } from "./unit";

// ===========================================
// BroodWoke
// ===========================================

/** Event type: a dormant brood woke. */
export const BROOD_WOKE = "tactical:brood-woke";

/** Payload of `BroodWoke`. */
export interface BroodWokePayload {
  readonly broodId: BroodId;
  readonly cause: BroodWakeCause;
  /** Where it slept, for the log line; absent for a brood placed without one. */
  readonly label?: string;
  /** The members that lost the `dormant` status, living or not, in brood order. */
  readonly unitIds: readonly UnitId[];
}

/**
 * A dormant brood woke, all of it at once (#1179, campaign arc §7.5).
 * No `UnitStatusChanged` per member follows: this one event is the
 * status change, and the renderer plays the whole brood's stir from it.
 * The members act from the next bug phase.
 */
export type BroodWokeEvent = DomainEvent<typeof BROOD_WOKE, BroodWokePayload>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [BROOD_WOKE]: BroodWokeEvent;
  }
}
