import type { DomainEvent } from "../../core/model/domain-event";
import type { ObjectiveId } from "./tactical-state";
import type { TunnelMouthId } from "./tunnel-mouth";
import type { UnitId } from "./unit";

// ===========================================
// TunnelChargeDisarmed
// ===========================================

/** Event type: a bug pulled the charge burning on a tunnel mouth (campaign arc §6.7). */
export const TUNNEL_CHARGE_DISARMED = "tactical:tunnel-charge-disarmed";

/** Payload of `TunnelChargeDisarmed`. */
export interface TunnelChargeDisarmedPayload {
  /** The bug whose melee attack pulled it. */
  readonly unitId: UnitId;
  readonly mouthId: TunnelMouthId;
  readonly objectiveId: ObjectiveId;
  /** The `PlacedCharge` that was burning; gone from `charges` now. */
  readonly chargeId: string;
  /** Charges pulled off this mouth so far, this one included. */
  readonly pulled: number;
}

/**
 * A bug's melee attack pulled a burning charge off a tunnel mouth
 * (Ben's rule, 2026-09-28): the charge is gone without going off, and
 * the mouth is open and uncharged, so burrowers still come up it and a
 * unit has to set a new charge, on a full fuse. Follows the attack's
 * own `AttackResolved`.
 */
export type TunnelChargeDisarmedEvent = DomainEvent<
  typeof TUNNEL_CHARGE_DISARMED,
  TunnelChargeDisarmedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [TUNNEL_CHARGE_DISARMED]: TunnelChargeDisarmedEvent;
  }
}
