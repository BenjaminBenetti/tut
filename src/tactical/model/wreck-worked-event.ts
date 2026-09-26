import type { DomainEvent } from "../../core/model/domain-event";
import type { MechWreckId } from "./mech-wreck";
import type { ObjectiveId } from "./tactical-state";
import type { UnitId } from "./unit";

// ===========================================
// WreckWorked
// ===========================================

/** Event type: a squad spent its turn stripping a mech wreck (arc §6.6). */
export const WRECK_WORKED = "tactical:wreck-worked";

/** Payload of `WreckWorked`. */
export interface WreckWorkedPayload {
  readonly unitId: UnitId;
  readonly wreckId: MechWreckId;
  readonly objectiveId: ObjectiveId;
  /** Turns worked so far, this one included. */
  readonly turnsWorked: number;
  /** Turns the wreck takes; equal to `turnsWorked` once it is stripped. */
  readonly turnsNeeded: number;
}

/**
 * A squad worked a wreck for one turn. When `turnsWorked` reaches
 * `turnsNeeded` the parts are loose, and ride home with that squad.
 */
export type WreckWorkedEvent = DomainEvent<
  typeof WRECK_WORKED,
  WreckWorkedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [WRECK_WORKED]: WreckWorkedEvent;
  }
}
