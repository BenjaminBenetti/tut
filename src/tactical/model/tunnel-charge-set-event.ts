import type { DomainEvent } from "../../core/model/domain-event";
import type { ObjectiveId } from "./tactical-state";
import type { TunnelMouthId } from "./tunnel-mouth";
import type { UnitId } from "./unit";

// ===========================================
// TunnelChargeSet
// ===========================================

/** Event type: a unit set a charge on a tunnel mouth (campaign arc §6.7). */
export const TUNNEL_CHARGE_SET = "tactical:tunnel-charge-set";

/** Payload of `TunnelChargeSet`. */
export interface TunnelChargeSetPayload {
  readonly unitId: UnitId;
  readonly mouthId: TunnelMouthId;
  readonly objectiveId: ObjectiveId;
  /** The `PlacedCharge` now burning on the mouth. */
  readonly chargeId: string;
  /** The turn whose player phase opening sets it off and seals the mouth. */
  readonly detonatesOnTurn: number;
}

/**
 * A unit set a charge on an open tunnel mouth. The charge burns in
 * `TacticalState.charges` like any breaching charge, and the mouth is
 * sealed when it goes off.
 */
export type TunnelChargeSetEvent = DomainEvent<
  typeof TUNNEL_CHARGE_SET,
  TunnelChargeSetPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [TUNNEL_CHARGE_SET]: TunnelChargeSetEvent;
  }
}
