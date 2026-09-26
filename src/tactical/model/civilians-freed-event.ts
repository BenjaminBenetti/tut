import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// CiviliansFreed
// ===========================================

/** Event type: a squad or mech got a trapped civilian group out of its building. */
export const CIVILIANS_FREED = "tactical:civilians-freed";

/** Payload of `CiviliansFreed` (campaign arc §6.4). */
export interface CiviliansFreedPayload {
  /** The civilian group, now free to move. */
  readonly unitId: UnitId;
  /** The squad or mech that used Interact beside it. */
  readonly rescuerId: UnitId;
  /** The rescue objective the group belongs to. */
  readonly objectiveId: string;
}

/** A trapped civilian group was freed; it takes orders from now on. */
export type CiviliansFreedEvent = DomainEvent<
  typeof CIVILIANS_FREED,
  CiviliansFreedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [CIVILIANS_FREED]: CiviliansFreedEvent;
  }
}
