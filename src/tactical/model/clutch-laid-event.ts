import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { SpawnerId } from "./tactical-state";
import type { UnitId } from "./unit";

// ===========================================
// ClutchLaid
// ===========================================

/** Event type: a Broodmother laid a clutch, a new egg spawner beside her. */
export const CLUTCH_LAID = "tactical:clutch-laid";

/** Payload of `ClutchLaid`. */
export interface ClutchLaidPayload {
  /** The bug that laid it. */
  readonly unitId: UnitId;
  /** The new egg spawner. */
  readonly spawnerId: SpawnerId;
  /** The tile it was laid on. */
  readonly pos: TileCoord;
}

/**
 * A Broodmother laid a clutch (#1179, campaign arc §6.8): an ordinary
 * egg spawner on a free tile beside her, which hatches on the spawn
 * tuning's clock like any nest.
 */
export type ClutchLaidEvent = DomainEvent<
  typeof CLUTCH_LAID,
  ClutchLaidPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [CLUTCH_LAID]: ClutchLaidEvent;
  }
}
