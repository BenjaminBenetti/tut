import type { DomainEvent } from "../../core/model/domain-event";
import type { AttackTargetKind } from "./attack-target";
import type { TileEffectId, TileEffectKind } from "./tile-effect";

// ===========================================
// EffectDamaged
// ===========================================

/** Event type: a tile effect hurt something standing in it. */
export const EFFECT_DAMAGED = "tactical:effect-damaged";

/** Payload of `EffectDamaged`. */
export interface EffectDamagedPayload {
  readonly effectId: TileEffectId;
  readonly kind: TileEffectKind;
  /** The unit or spawner that burned. */
  readonly targetId: string;
  readonly targetKind: AttackTargetKind;
  /** Hit points removed after armor, `> 0`. */
  readonly damage: number;
  /** Its hit points afterwards. */
  readonly hp: number;
}

/** A tile effect dealt its damage on its turn (#1121). */
export type EffectDamagedEvent = DomainEvent<
  typeof EFFECT_DAMAGED,
  EffectDamagedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [EFFECT_DAMAGED]: EffectDamagedEvent;
  }
}
