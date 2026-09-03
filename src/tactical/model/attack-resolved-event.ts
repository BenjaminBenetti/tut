import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// AttackResolved
// ===========================================

/** Event type: one attack was rolled and applied. */
export const ATTACK_RESOLVED = "tactical:attack-resolved";

/** Payload of `AttackResolved`. */
export interface AttackResolvedPayload {
  readonly attackerId: UnitId;
  readonly targetId: UnitId;
  readonly hit: boolean;
  /** Hit points removed after armor; `0` on a miss. */
  readonly damage: number;
  /** The target's hit points after the attack. */
  readonly targetHp: number;
}

/** One attack was rolled and applied. */
export type AttackResolvedEvent = DomainEvent<
  typeof ATTACK_RESOLVED,
  AttackResolvedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [ATTACK_RESOLVED]: AttackResolvedEvent;
  }
}
