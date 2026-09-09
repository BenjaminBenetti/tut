import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import type { UnitId } from "../model/unit";

// ===========================================
// Acting preconditions
// ===========================================

/**
 * The four questions every action asks before it does anything: is the
 * unit here, is it standing, is it this side's phase, and has it the
 * action points.
 *
 * ```
 *   not on the map ──► unit-not-on-map      wrong side's phase ──► wrong-phase
 *   hp <= 0        ──► unit-dead            ap < cost          ──► no-action-points
 * ```
 *
 * One implementation, for the reason #992 gave: `overwatchHandler` and
 * `reloadHandler` each wrote these four out in the same order, and
 * `validateAttack` carries its own copy, so the same rule existed three
 * times and nothing kept them agreeing.
 *
 * It returns the **error**, not a boolean, because the interface needs
 * the reason and not merely the refusal. The action bar used to compute
 * its own `canAct` boolean from a fourth copy of this rule and throw the
 * reason away, which is why a disabled button could not say why it was
 * disabled (#1030). Now the button asks this and the words come from
 * `describeTacticalError`.
 *
 * @param mission - The mission the unit is in.
 * @param unitId - The unit that wants to act.
 * @param apCost - Action points the action costs; 0 for one that is free.
 * @returns The unit when it may act, or the reason it may not.
 */
export function actingUnit(
  mission: TacticalState,
  unitId: UnitId,
  apCost: number,
): Result<Unit, TacticalError> {
  const unit = mission.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) {
    return err({ kind: "unit-not-on-map", unitId });
  }
  if (unit.hp <= 0) {
    return err({ kind: "unit-dead", unitId });
  }
  if (unit.team !== TEAM_FOR_PHASE[mission.phase]) {
    return err({ kind: "wrong-phase", unitId });
  }
  if (unit.ap < apCost) {
    return err({ kind: "no-action-points", unitId });
  }
  return ok(unit);
}
