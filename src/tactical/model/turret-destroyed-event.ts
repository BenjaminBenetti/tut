import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// TurretDestroyed
// ===========================================

/** Event type: a turret was shot, blown or burned to zero hit points (#1155). */
export const TURRET_DESTROYED = "tactical:turret-destroyed";

/** Payload of `TurretDestroyed`. */
export interface TurretDestroyedPayload {
  readonly turretId: UnitId;
  /** Where it stood; the scene takes the model away as it takes a corpse. */
  readonly pos: TileCoord;
  /** Who dealt the killing blow, if a unit did; a fire names nobody. */
  readonly killerId?: UnitId;
}

/**
 * A turret reached zero hit points by damage (#1155): a bug bit through
 * it, a blast caught it, a fire took it. Where a squad or a bug gets a
 * `UnitDied`, a turret gets this, so the debrief has no one to mourn
 * and no kill to credit — a garrison turret is the region's furniture,
 * an engineer's is equipment — while the scene still gets a moment to
 * fade it out. Its battery is beside the point: an engineer's turret
 * destroyed with turns left and a garrison turret with no battery at
 * all both end here; only a battery running dry is a `TurretBurnedOut`.
 */
export type TurretDestroyedEvent = DomainEvent<
  typeof TURRET_DESTROYED,
  TurretDestroyedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [TURRET_DESTROYED]: TurretDestroyedEvent;
  }
}
