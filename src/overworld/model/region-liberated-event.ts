import type { DomainEvent } from "../../core/model/domain-event";
import type { HiveId } from "./hive";
import type { RegionId } from "./region";

// ===========================================
// Region liberated
// ===========================================

/** Event type emitted when a won Hive Assault destroys a hive. */
export const REGION_LIBERATED = "overworld:region-liberated";

/** What presentation needs to announce the liberation. */
export interface RegionLiberatedPayload {
  /** The hive that fell; it is no longer in `OverworldState.hives`. */
  readonly hiveId: HiveId;
  /** The region it was rooted in, now paused until `pausedUntilDay`. */
  readonly regionId: RegionId;
  /** The first day the region grows and spreads again. */
  readonly pausedUntilDay: number;
}

/**
 * A won Hive Assault destroyed a hive and liberated its region (campaign
 * arc §6.5). Emitted once, beside the `CityInfestationChanged` events of
 * the region's cities; a consequence replayed on a hive already gone
 * emits nothing.
 */
export type RegionLiberatedEvent = DomainEvent<
  typeof REGION_LIBERATED,
  RegionLiberatedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [REGION_LIBERATED]: RegionLiberatedEvent;
  }
}
