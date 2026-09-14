import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Team, UnitId, UnitKind } from "./unit";

// ===========================================
// UnitPlaced
// ===========================================

/** Event type: the development tools put a unit on the map (#1136). */
export const UNIT_PLACED = "tactical:unit-placed";

/** Payload of `UnitPlaced`. */
export interface UnitPlacedPayload {
  readonly unitId: UnitId;
  readonly kind: UnitKind;
  readonly team: Team;
  /** The anchor tile it was put on. */
  readonly tile: TileCoord;
}

/**
 * A unit appeared on the map by the debug menu rather than by any rule
 * of the game. Its own event rather than `BugsSpawned` because a placed
 * squad is not a hatchling, and because the log should say plainly
 * that a tester did this: a playtest that reads "3 bugs hatched" for a
 * bug nobody's spawner produced is a playtest measuring the harness.
 */
export type UnitPlacedEvent = DomainEvent<
  typeof UNIT_PLACED,
  UnitPlacedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_PLACED]: UnitPlacedEvent;
  }
}
