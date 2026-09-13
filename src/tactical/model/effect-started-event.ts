import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TileEffectId, TileEffectKind } from "./tile-effect";
import type { UnitId } from "./unit";

// ===========================================
// EffectStarted
// ===========================================

/** Event type: a tile effect was lit, or a burning one was rekindled. */
export const EFFECT_STARTED = "tactical:effect-started";

/** Payload of `EffectStarted`. */
export interface EffectStartedPayload {
  readonly effectId: TileEffectId;
  readonly kind: TileEffectKind;
  readonly tile: TileCoord;
  /** The unit whose shot lit it. */
  readonly unitId: UnitId;
  /** True when the tile was already burning and the blast only reset its clock. */
  readonly rekindled: boolean;
}

/** A tile effect began (#1121). */
export type EffectStartedEvent = DomainEvent<
  typeof EFFECT_STARTED,
  EffectStartedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [EFFECT_STARTED]: EffectStartedEvent;
  }
}
