import type { PhaseStep } from "../../tactical/model/phase-step";
import { SOVEREIGN_RETREATING } from "../../tactical/model/sovereign-retreating-event";
import type {
  TacticalApplied,
  TacticalEvent,
} from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import type { SovereignTuning } from "../model/sovereign-tuning";
import { isRetreating, isSovereign } from "./sovereign-service";

// ===========================================
// Step
// ===========================================

/**
 * The phase step that marks the Sovereign's retreat (#1179, campaign
 * arc §9). It runs as every phase opens, so a wound taken in the
 * player's phase is answered as the bugs' opens.
 *
 * @param tuning - Her numbers (the retreat threshold); the shipped set by default.
 * @returns The step.
 */
export function createSovereignRetreatStep(
  tuning: SovereignTuning = SOVEREIGN_TUNING,
): PhaseStep {
  return (mission) => sovereignRetreat(mission, tuning);
}

/**
 * Marks every Sovereign that has fallen to her retreat threshold. The
 * rules half of her retreat — the behaviour, or Jev, does the walking:
 *
 * ```
 *   for each living Sovereign, in units order
 *     hp ≤ maxHp·retreatAtHpFraction and not yet marked
 *       ──► retreating: true, SovereignRetreating     (once, for good)
 * ```
 *
 * Unlike the Broodmother's flight there is no edge rule: she falls back
 * onto the core and holds it; she never leaves the map.
 *
 * Draws nothing; a mission without a Sovereign comes back as it was.
 *
 * @param mission - The mission, its new phase and turn already set.
 * @param tuning - Her numbers.
 * @returns The mission with the newly retreating marked, and a `SovereignRetreating` for each.
 */
export function sovereignRetreat(
  mission: TacticalState,
  tuning: SovereignTuning = SOVEREIGN_TUNING,
): TacticalApplied<TacticalState> {
  const turned = mission.units.filter(
    (unit) =>
      isSovereign(unit) &&
      unit.hp > 0 &&
      unit.retreating !== true &&
      isRetreating(unit, tuning),
  );
  if (turned.length === 0) {
    return { state: mission, events: [] };
  }
  const ids = new Set(turned.map((unit) => unit.id));
  const units = mission.units.map((unit): Unit =>
    ids.has(unit.id) ? { ...unit, retreating: true } : unit,
  );
  const events: TacticalEvent[] = turned.map((unit) => ({
    type: SOVEREIGN_RETREATING,
    payload: { unitId: unit.id, hp: unit.hp, maxHp: unit.maxHp },
  }));
  return { state: { ...mission, units }, events };
}
