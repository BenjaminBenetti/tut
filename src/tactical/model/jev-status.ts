import { UNIT_STATUSES } from "./unit";
import type { UnitStatus } from "./unit";

// ===========================================
// Statuses on the Jev wire
// ===========================================

/**
 * A status Jev reads on a unit (ADR 0012): every `UnitStatus`, plus the
 * states the game keeps as flags rather than in `Unit.status`.
 *
 *   Unit.status  ──────────────────────────┐
 *   Unit.fleeing === true ──► "fleeing" ───┴──► actor.status / entities[].status
 *
 * `fleeing` is the Broodmother's sticky flight (#1179, arc §6.8): the
 * unit card and the log show it, so both factions may read it.
 */
export type JevStatus = UnitStatus | "fleeing";

/**
 * Every `JevStatus`, in a fixed order: the `UnitStatus`es first, in the
 * model's order, then the flag statuses. `jev-protocol.json` describes
 * each one, and the relay's closed shape accepts each one.
 */
export const JEV_STATUSES = [
  ...UNIT_STATUSES,
  "fleeing",
] as const satisfies readonly JevStatus[];
