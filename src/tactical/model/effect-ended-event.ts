import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TileEffectId, TileEffectKind } from "./tile-effect";

// ===========================================
// EffectEnded
// ===========================================

/** Event type: a tile effect burned out. */
export const EFFECT_ENDED = "tactical:effect-ended";

/** Payload of `EffectEnded`. */
export interface EffectEndedPayload {
  readonly effectId: TileEffectId;
  readonly kind: TileEffectKind;
  readonly tile: TileCoord;
}

/** A tile effect ran out of phases and is gone (#1121). */
export type EffectEndedEvent = DomainEvent<
  typeof EFFECT_ENDED,
  EffectEndedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [EFFECT_ENDED]: EffectEndedEvent;
  }
}
