import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// BroodmotherEscaped
// ===========================================

/** Event type: a fleeing Broodmother reached the map edge and left the map. */
export const BROODMOTHER_ESCAPED = "tactical:broodmother-escaped";

/** Payload of `BroodmotherEscaped`. */
export interface BroodmotherEscapedPayload {
  /** The Broodmother, now in `TacticalState.escaped`. */
  readonly unitId: UnitId;
  /** Her anchor tile when she left. */
  readonly pos: TileCoord;
  /** Her hit points when she left. */
  readonly hp: number;
}

/**
 * A fleeing Broodmother reached the map edge and escaped (#1179,
 * campaign arc §6.8). She is off the map, frozen in
 * `TacticalState.escaped`; Alpha Hunt's objective and the nemesis
 * record read that (`broodmotherEscaped`), not this event.
 */
export type BroodmotherEscapedEvent = DomainEvent<
  typeof BROODMOTHER_ESCAPED,
  BroodmotherEscapedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [BROODMOTHER_ESCAPED]: BroodmotherEscapedEvent;
  }
}
