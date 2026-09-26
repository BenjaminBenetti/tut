import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// UnitSurfaced
// ===========================================

/** Event type: a burrowed unit came up onto the surface (#1179). */
export const UNIT_SURFACED = "tactical:unit-surfaced";

/** Payload of `UnitSurfaced`. */
export interface UnitSurfacedPayload {
  readonly unitId: UnitId;
  /** The tile it came up on. */
  readonly pos: TileCoord;
  /**
   * The living enemies within arm's reach of it as it came up, in
   * `units` order: who it surfaced beside, for the log line. Empty when
   * it came up with nobody near, which nobody saw, so nothing says so.
   */
  readonly beside: readonly UnitId[];
}

/**
 * A burrower came up. The surfacing moment: the log names who it came up
 * beside, an indicator rises over it, and the scene raises it out of a
 * burst of earth. Any overwatch it provoked follows it in the batch.
 */
export type UnitSurfacedEvent = DomainEvent<
  typeof UNIT_SURFACED,
  UnitSurfacedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_SURFACED]: UnitSurfacedEvent;
  }
}
