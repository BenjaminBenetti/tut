import type { DomainEvent } from "../../core/model/domain-event";
import type { EquipmentId } from "./equipment";
import type { UnitId } from "./unit";

// ===========================================
// UnitsHealed
// ===========================================

/** Event type: a medkit or a repair kit mended units where it was used (#1138). */
export const UNITS_HEALED = "tactical:units-healed";

/** One unit a heal reached and what it got back. */
export interface HealedUnit {
  readonly unitId: UnitId;
  /** Hit points restored, `> 0`: a unit already whole is not listed. */
  readonly amount: number;
  /** Its hit points afterwards. */
  readonly hpAfter: number;
}

/** Payload of `UnitsHealed`. */
export interface UnitsHealedPayload {
  /** The kit that did it, e.g. `"medkit"`. */
  readonly kitId: EquipmentId;
  /** The unit that used it. */
  readonly userId: UnitId;
  /** Everyone it mended, the impact tile first; never empty. */
  readonly healed: readonly HealedUnit[];
}

/**
 * A heal was applied (#1138). One event for the whole area, the way a
 * blast reports every victim at once: the HUD floats one number over
 * each unit named, and the log writes one line.
 */
export type UnitsHealedEvent = DomainEvent<
  typeof UNITS_HEALED,
  UnitsHealedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [UNITS_HEALED]: UnitsHealedEvent;
  }
}
