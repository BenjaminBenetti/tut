import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// SovereignRetreating
// ===========================================

/** Event type: the Sovereign is badly hurt and has fallen back onto the core. */
export const SOVEREIGN_RETREATING = "tactical:sovereign-retreating";

/** Payload of `SovereignRetreating`. */
export interface SovereignRetreatingPayload {
  /** The Sovereign. */
  readonly unitId: UnitId;
  /** Her hit points when she turned. */
  readonly hp: number;
  /** Her max hit points. */
  readonly maxHp: number;
}

/**
 * The Sovereign has turned back to the core (#1179, campaign arc §9,
 * "retreat to the core"): at or below her retreat threshold she falls
 * back onto the core she guards and holds it to the end. Announced
 * once, as the first phase after the wound opens.
 */
export type SovereignRetreatingEvent = DomainEvent<
  typeof SOVEREIGN_RETREATING,
  SovereignRetreatingPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [SOVEREIGN_RETREATING]: SovereignRetreatingEvent;
  }
}
