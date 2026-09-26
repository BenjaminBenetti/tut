import type { DomainEvent } from "../../core/model/domain-event";
import type { ContinentId } from "./continent";
import type { GreatHiveId } from "./great-hive";
import type { RegionId } from "./region";

// ===========================================
// Great Hive destroyed
// ===========================================

/** Event type emitted when a won Great Hive assault destroys its beacon. */
export const GREAT_HIVE_DESTROYED = "overworld:great-hive-destroyed";

/** What presentation needs to announce the fall and the tally. */
export interface GreatHiveDestroyedPayload {
  readonly greatHiveId: GreatHiveId;
  readonly continentId: ContinentId;
  /** The continent's name: "Europe". */
  readonly name: string;
  /** Every region of the continent, each liberated until `pausedUntilDay`. */
  readonly regionIds: readonly RegionId[];
  /** The first day the liberated regions grow and spread again. */
  readonly pausedUntilDay: number;
  /** Great Hives destroyed, this one included. */
  readonly destroyed: number;
  /** Great Hives revealed. */
  readonly total: number;
}

/**
 * A Great Hive fell and its continent was liberated (campaign arc
 * §6.9). Emitted once per Great Hive, beside the `CityInfestationChanged`
 * events of the continent's cities, and before the `CampaignFlagSet` of
 * `great-hives-destroyed` when it was the last.
 */
export type GreatHiveDestroyedEvent = DomainEvent<
  typeof GREAT_HIVE_DESTROYED,
  GreatHiveDestroyedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [GREAT_HIVE_DESTROYED]: GreatHiveDestroyedEvent;
  }
}
