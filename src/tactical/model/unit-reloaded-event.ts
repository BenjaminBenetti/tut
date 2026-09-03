import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// UnitReloaded
// ===========================================

/** Event type emitted when a unit reloads its magazines or vents its heat (#409). */
export const UNIT_RELOADED = "tactical:unit-reloaded";

/** What the HUD needs to refresh the charge readout. */
export interface UnitReloadedPayload {
  readonly unitId: UnitId;
  /** The pool after reloading: the template's full charges. */
  readonly charges: number;
}

/** A unit refilled its charge pool for one action. */
export type UnitReloadedEvent = DomainEvent<
  typeof UNIT_RELOADED,
  UnitReloadedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNIT_RELOADED]: UnitReloadedEvent;
  }
}
