import type { WeaponId } from "../model/unit-weapon";
import { err, ok } from "../../core/model/result";
import type { ReloadCommand } from "../model/reload-command";
import type { TacticalHandler } from "../model/tactical-handler";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import { UNIT_RELOADED } from "../model/unit-reloaded-event";

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
export const reloadHandler: TacticalHandler<ReloadCommand> = (
  mission,
  command,
) => {
  const { unitId } = command.payload;
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
  if (unit.ap < RELOAD_AP_COST) {
    return err({ kind: "no-action-points", unitId });
  }
  const template = mission.templates[unit.templateId];
  // One reload refills every pool the unit carries (#532). A mech vents
  // its whole heat load rather than one barrel at a time, and a squad
  // has a single pool anyway, so per-weapon reloading would be an action
  // cost with no decision in it.
  const pools = (template?.weapons ?? []).filter(
    (weapon) => weapon.charges !== undefined,
  );
  if (pools.length === 0) {
    return err({ kind: "no-reload", unitId });
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
    return err({ kind: "charges-full", unitId });
  }
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
