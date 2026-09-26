import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// CiviliansExtracted
// ===========================================

/** Event type: a civilian group boarded the drop ship. */
export const CIVILIANS_EXTRACTED = "tactical:civilians-extracted";

/**
 * Payload of `CiviliansExtracted` (campaign arc §6.4). Carries the
 * running count, so a log line can say how the rescue stands without
 * naming a unit that has already left the map.
 */
export interface CiviliansExtractedPayload {
  /** The group that boarded. */
  readonly unitId: UnitId;
  /** The rescue objective it counts toward. */
  readonly objectiveId: string;
  /** Groups aboard so far, this one included. */
  readonly rescued: number;
  /** Groups the objective tracks. */
  readonly total: number;
}

/** A civilian group is aboard; the rescue's count went up by one. */
export type CiviliansExtractedEvent = DomainEvent<
  typeof CIVILIANS_EXTRACTED,
  CiviliansExtractedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [CIVILIANS_EXTRACTED]: CiviliansExtractedEvent;
  }
}
