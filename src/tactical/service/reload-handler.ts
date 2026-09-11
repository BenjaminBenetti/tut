import type { WeaponId } from "../model/unit-weapon";
import { err, ok } from "../../core/model/result";
import { actingUnit } from "./acting-unit";
import type { ReloadCommand } from "../model/reload-command";
import type { TacticalHandler } from "../model/tactical-handler";
import { UNIT_RELOADED } from "../model/unit-reloaded-event";
import type { Result } from "../../core/model/result";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";

// ===========================================
// Constants
// ===========================================

/** Action points a reload or vent costs (GDD §6.2: reload is one action). */
export const RELOAD_AP_COST = 1;

// ===========================================
// Handler
// ===========================================

/**
 * `Reload` (#409): a squad reloads, a mech vents. Spends one action and
 * refills the unit's charge pool to its template's full value. Refused
 * for a unit that is dead, not on the acting side, out of actions,
 * already full, or without a pool (bugs). Emits `UnitReloaded`.
 *
 * ```
 *   unit.charges < template.charges, ap ≥ 1 ──► ap − 1, charges = template.charges
 * ```
 */
/**
 * The pools a reload would refill, or why it would not.
 *
 * ```
 *   carries nothing with charges ──► no-reload
 *   nothing missing              ──► charges-full
 * ```
 *
 * Exported so the action bar can ask the same question the command
 * answers (#1030). It used to live only inside the handler, so the bar
 * offered Reload to a unit at full charges and the player found out by
 * pressing it — eng-5 caught that on `6a552d6` with a mech at heat 4/4.
 *
 * One reload refills every pool the unit carries (#532): a mech vents
 * its whole heat load rather than one barrel at a time, and a squad has
 * a single pool anyway, so per-weapon reloading would be an action cost
 * with no decision in it.
 *
 * @param mission - The mission the unit is in.
 * @param unit - The unit that wants to reload.
 * @returns Each pool at capacity, or the refusal.
 */
export function reloadPools(
  mission: TacticalState,
  unit: Unit,
): Result<Record<WeaponId, number>, TacticalError> {
  const template = mission.templates[unit.templateId];
  const pools = (template?.weapons ?? []).filter(
    (weapon) => weapon.charges !== undefined,
  );
  if (pools.length === 0) {
    return err({ kind: "no-reload", unitId: unit.id });
  }
  const full: Record<WeaponId, number> = {};
  let anyMissing = false;
  for (const weapon of pools) {
    const capacity = weapon.charges ?? 0;
    full[weapon.id] = capacity;
    if ((unit.charges?.[weapon.id] ?? capacity) < capacity) {
      anyMissing = true;
    }
  }
  if (!anyMissing) {
    return err({ kind: "charges-full", unitId: unit.id });
  }
  return ok(full);
}

export const reloadHandler: TacticalHandler<ReloadCommand> = (
  mission,
  command,
) => {
  const { unitId } = command.payload;
  const acting = actingUnit(mission, unitId, RELOAD_AP_COST);
  if (!acting.ok) {
    return acting;
  }
  const refilled = reloadPools(mission, acting.value);
  if (!refilled.ok) {
    return refilled;
  }
  const full = refilled.value;
  return ok({
    state: {
      ...mission,
      units: mission.units.map((candidate) =>
        candidate.id === unitId
          ? {
              ...candidate,
              ap: candidate.ap - RELOAD_AP_COST,
              charges: { ...candidate.charges, ...full },
            }
          : candidate,
      ),
    },
    events: [{ type: UNIT_RELOADED, payload: { unitId, charges: full } }],
  });
};
