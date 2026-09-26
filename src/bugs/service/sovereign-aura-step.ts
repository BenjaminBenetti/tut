import type { PhaseStep } from "../../tactical/model/phase-step";
import { SOVEREIGN_AURA } from "../../tactical/model/sovereign-aura-event";
import type {
  TacticalApplied,
  TacticalEvent,
} from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { restingBugIds } from "../../tactical/service/dormancy-service";
import { unitFootprintSize } from "../../tactical/service/footprint-service";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import type { SovereignAuraTuning } from "../model/sovereign-tuning";
import { groundGap, isSovereign } from "./sovereign-service";

// ===========================================
// Step
// ===========================================

/**
 * The phase step that lends the Sovereign's aura (#1179, campaign arc
 * §9, "buff nearby bugs"). It runs as every phase opens: the bugs'
 * phase to lend it, every phase to take back what the last one lent.
 *
 * @param aura - Her aura's reach and bonus; the shipped set by default.
 * @returns The step.
 */
export function createSovereignAuraStep(
  aura: SovereignAuraTuning = SOVEREIGN_TUNING.aura,
): PhaseStep {
  return (mission) => sovereignAura(mission, aura);
}

/**
 * Clears last phase's aura and lends this one's. The buff is a rule,
 * not an order, so it holds whoever drives her — the fallback or Jev:
 *
 * ```
 *   every phase opens
 *     every unit's auraDamage ──► cleared         (the buff lasts one phase)
 *   the bugs' phase opens, for each living Sovereign, in units order
 *     every other living bug, awake (not dormant, not woken this
 *     phase), whose block comes within aura.radius ground tiles of hers
 *       ──► auraDamage = aura.damageBonus
 *     any reached ──► SovereignAura { unitId, empowered, damageBonus }
 * ```
 *
 * Two Sovereigns do not stack: a bug inside both auras hits for the
 * bonus once, and each lists it. The Sovereign lends nothing to
 * herself. A bug too far away is left as it was.
 *
 * Draws nothing; a mission without a Sovereign or an aura comes back
 * as it was.
 *
 * @param mission - The mission, its new phase and turn already set.
 * @param aura - Her aura's reach and bonus.
 * @returns The mission with this phase's aura, and a `SovereignAura` for each Sovereign that reached anyone.
 */
export function sovereignAura(
  mission: TacticalState,
  aura: SovereignAuraTuning = SOVEREIGN_TUNING.aura,
): TacticalApplied<TacticalState> {
  const cleared = clearAura(mission);
  if (mission.phase !== "bugs" || aura.damageBonus <= 0) {
    return { state: cleared, events: [] };
  }
  const sovereigns = cleared.units.filter(
    (unit) => isSovereign(unit) && unit.hp > 0,
  );
  if (sovereigns.length === 0) {
    return { state: cleared, events: [] };
  }
  const resting = restingBugIds(cleared);
  const allies = cleared.units.filter(
    (unit) =>
      unit.team === "bugs" &&
      unit.hp > 0 &&
      !isSovereign(unit) &&
      !resting.has(unit.id),
  );
  const empowered = new Set<UnitId>();
  const events: TacticalEvent[] = [];
  for (const sovereign of sovereigns) {
    const size = unitFootprintSize(cleared, sovereign);
    const reached = allies
      .filter(
        (ally) =>
          groundGap(
            sovereign.pos,
            size,
            ally.pos,
            unitFootprintSize(cleared, ally),
          ) <= aura.radius,
      )
      .map((ally) => ally.id);
    if (reached.length === 0) {
      continue;
    }
    for (const id of reached) {
      empowered.add(id);
    }
    events.push({
      type: SOVEREIGN_AURA,
      payload: {
        unitId: sovereign.id,
        empowered: reached,
        damageBonus: aura.damageBonus,
      },
    });
  }
  if (empowered.size === 0) {
    return { state: cleared, events: [] };
  }
  const units = cleared.units.map((unit): Unit =>
    empowered.has(unit.id) ? { ...unit, auraDamage: aura.damageBonus } : unit,
  );
  return { state: { ...cleared, units }, events };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The mission with no unit carrying an aura bonus: `mission` itself
 * when none does, so a mission that never met a Sovereign is untouched.
 */
function clearAura(mission: TacticalState): TacticalState {
  if (!mission.units.some((unit) => unit.auraDamage !== undefined)) {
    return mission;
  }
  return {
    ...mission,
    units: mission.units.map((unit) => {
      if (unit.auraDamage === undefined) {
        return unit;
      }
      const { auraDamage: _lent, ...rest } = unit;
      return rest;
    }),
  };
}
