import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// GuardsSummoned
// ===========================================

/** Event type: the Sovereign called guards to her side. */
export const GUARDS_SUMMONED = "tactical:guards-summoned";

/** Payload of `GuardsSummoned`. */
export interface GuardsSummonedPayload {
  /** The Sovereign. */
  readonly unitId: UnitId;
  /** The guards placed, in the order they were placed. Never empty. */
  readonly guardIds: readonly UnitId[];
}

/**
 * The Sovereign summoned guards (#1179, campaign arc §9, "summon
 * guards"): escorts stood on free tiles near her through the ordinary
 * placement path, arriving with no action points, as a hatchling does.
 * Not announced when no tile near her could hold one.
 */
export type GuardsSummonedEvent = DomainEvent<
  typeof GUARDS_SUMMONED,
  GuardsSummonedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [GUARDS_SUMMONED]: GuardsSummonedEvent;
  }
}
