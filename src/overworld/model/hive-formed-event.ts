import type { DomainEvent } from "../../core/model/domain-event";
import type { Hive } from "./hive";

// ===========================================
// Hive formed
// ===========================================

/** Event type emitted when a bug hive takes root in a region. */
export const HIVE_FORMED = "overworld:hive-formed";

/** What presentation needs to announce the new hive. */
export interface HiveFormedPayload {
  /** The hive as it now stands in `OverworldState.hives`. */
  readonly hive: Hive;
}

/**
 * A hive formed in a region (campaign arc §6.5): by the daily
 * `hive-formation` step after a week at the threshold, or scripted when
 * Act II opens.
 */
export type HiveFormedEvent = DomainEvent<
  typeof HIVE_FORMED,
  HiveFormedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [HIVE_FORMED]: HiveFormedEvent;
  }
}
