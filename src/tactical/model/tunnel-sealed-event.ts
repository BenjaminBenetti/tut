import type { DomainEvent } from "../../core/model/domain-event";
import type { ObjectiveId } from "./tactical-state";
import type { TunnelMouthId } from "./tunnel-mouth";

// ===========================================
// TunnelSealed
// ===========================================

/** Event type: a tunnel mouth collapsed under its charge (campaign arc §6.7). */
export const TUNNEL_SEALED = "tactical:tunnel-sealed";

/** Payload of `TunnelSealed`. */
export interface TunnelSealedPayload {
  readonly mouthId: TunnelMouthId;
  readonly objectiveId: ObjectiveId;
  /** The charge whose blast sealed it. */
  readonly chargeId: string;
  /** Mouths of the objective sealed now, this one included. */
  readonly sealed: number;
  /** Mouths the objective asks for. */
  readonly total: number;
}

/**
 * A tunnel mouth's charge went off and the mouth caved in: no burrower
 * comes up through it again. Follows the charge's own `ChargeDetonated`
 * and blast in the same phase start.
 */
export type TunnelSealedEvent = DomainEvent<
  typeof TUNNEL_SEALED,
  TunnelSealedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [TUNNEL_SEALED]: TunnelSealedEvent;
  }
}
