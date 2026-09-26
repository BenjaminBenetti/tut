import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { Unit, UnitId, UnitKind } from "./unit";
import type { UnitTemplateId } from "./unit-template";

// ===========================================
// Carried specimen
// ===========================================

/**
 * A bug taken alive with a capture net (#1179, campaign arc §6.9) and
 * carried by a squad. The bug itself has left the map — it no longer
 * acts, is nobody's enemy and is not counted with the bugs — and this
 * record is all that is left of it, riding on its carrier's `carrying`.
 *
 * ```
 *   net thrown ──► bug removed from units ──► carrier.carrying = specimen
 *                                                   │
 *        carrier extracted ──► the specimen goes home with it
 *        carrier downed    ──► the specimen lies where it fell (a dropped
 *                              specimen, on the dead carrier's record)
 *                              ──► Interact by another squad picks it up
 * ```
 *
 * Plain serialisable data, like every other field on a unit; absent on
 * every unit that carries nothing and on every unit saved before
 * specimens, so no save needs a migration.
 */
export interface CarriedSpecimen {
  /** The captured bug's own unit id, kept so the log and the scene can name it. */
  readonly unitId: UnitId;
  /** What it is: the species a capture objective asks for. */
  readonly species: BugSpeciesId;
  /** The bug's template, still in `mission.templates`, for its name and model. */
  readonly templateId: UnitTemplateId;
  /** Movement points per action its carrier loses while it carries it. */
  readonly movePenalty: number;
}

// ===========================================
// Carriers
// ===========================================

/**
 * The unit kinds that can carry a specimen (#1179): infantry squads. A
 * mech has no hands free, a bug is the thing carried, and a turret or
 * a generator takes no orders.
 */
export const SPECIMEN_CARRIER_KINDS: readonly UnitKind[] = ["squad"];

/**
 * Whether the unit is of a kind that can carry a specimen (#1179). It
 * says nothing about whether its hands are free: read `carrying` for
 * that.
 *
 * @param unit - The unit, or anything with its kind.
 * @returns True for an infantry squad.
 */
export function canCarrySpecimen(unit: Pick<Unit, "kind">): boolean {
  return SPECIMEN_CARRIER_KINDS.includes(unit.kind);
}

/**
 * Movement points per action the unit loses to what it carries (#1179):
 * the specimen's penalty, or none when its hands are empty.
 *
 * @param unit - The unit.
 * @returns A non-negative number of movement points.
 */
export function carryMovePenaltyOf(unit: Pick<Unit, "carrying">): number {
  return Math.max(0, unit.carrying?.movePenalty ?? 0);
}
