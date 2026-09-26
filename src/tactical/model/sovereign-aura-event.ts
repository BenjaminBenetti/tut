import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// SovereignAura
// ===========================================

/** Event type: the Sovereign's aura empowered the bugs around her for this bug phase. */
export const SOVEREIGN_AURA = "tactical:sovereign-aura";

/** Payload of `SovereignAura`. */
export interface SovereignAuraPayload {
  /** The Sovereign. */
  readonly unitId: UnitId;
  /** The bugs her aura reached, in unit order. Never empty. */
  readonly empowered: readonly UnitId[];
  /** Damage each of their hits adds for the phase. */
  readonly damageBonus: number;
}

/**
 * The Sovereign's aura took hold as a bug phase opened (#1179, campaign
 * arc §9, "buff nearby bugs"): every bug in `empowered` hits for
 * `damageBonus` more until the phase ends (`Unit.auraDamage`). Not
 * announced when no bug stands within her reach.
 */
export type SovereignAuraEvent = DomainEvent<
  typeof SOVEREIGN_AURA,
  SovereignAuraPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [SOVEREIGN_AURA]: SovereignAuraEvent;
  }
}
