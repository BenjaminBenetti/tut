import type { DomainEvent } from "../../core/model/domain-event";

// ===========================================
// Day advanced
// ===========================================

/** Event type emitted once per `AdvanceDay` after the tick pipeline ran. */
export const DAY_ADVANCED = "overworld:day-advanced";

/** What presentation needs to animate the calendar. */
export interface DayAdvancedPayload {
  /** Day before the tick. */
  readonly from: number;
  /** Day after the tick. Always `from + 1`. */
  readonly to: number;
}

/** The campaign moved one day forward. */
export type DayAdvancedEvent = DomainEvent<
  typeof DAY_ADVANCED,
  DayAdvancedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [DAY_ADVANCED]: DayAdvancedEvent;
  }
}
