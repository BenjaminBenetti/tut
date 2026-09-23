import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// GeneratorDestroyed
// ===========================================

export const GENERATOR_DESTROYED = "tactical:generator-destroyed";

/** A generator wrecked (#1175); `killerId` when a unit did it. */
export interface GeneratorDestroyedPayload {
  readonly generatorId: UnitId;
  readonly pos: TileCoord;
  readonly killerId?: UnitId;
}

export type GeneratorDestroyedEvent = DomainEvent<
  typeof GENERATOR_DESTROYED,
  GeneratorDestroyedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [GENERATOR_DESTROYED]: GeneratorDestroyedEvent;
  }
}
