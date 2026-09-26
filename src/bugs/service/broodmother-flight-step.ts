import { BROODMOTHER_ESCAPED } from "../../tactical/model/broodmother-escaped-event";
import { BROODMOTHER_FLEEING } from "../../tactical/model/broodmother-fleeing-event";
import type { PhaseStep } from "../../tactical/model/phase-step";
import type {
  TacticalApplied,
  TacticalEvent,
} from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { unitFootprintSize } from "../../tactical/service/footprint-service";
import {
  leaveByMapEdge,
  touchesMapEdge,
} from "../../tactical/service/map-edge-service";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import type { BroodmotherTuning } from "../model/broodmother-tuning";
import { isBroodmother, isFleeing } from "./broodmother-service";

// ===========================================
// Step
// ===========================================

/**
 * The phase step that runs the Broodmother's flight (#1179, campaign
 * arc §6.8). It runs as every phase opens, so a wound taken in the
 * player's phase is answered as the bugs' opens, and a Broodmother who
 * reached the edge in the bugs' phase is gone before the player's.
 *
 * @param tuning - Her numbers (the flee threshold); the shipped set by default.
 * @returns The step.
 */
export function createBroodmotherFlightStep(
  tuning: BroodmotherTuning = BROODMOTHER_TUNING,
): PhaseStep {
  return (mission) => broodmotherFlight(mission, tuning);
}

/**
 * Marks and removes fleeing Broodmothers. The rules half of her flight
 * — the behaviour, or Jev, does the running:
 *
 * ```
 *   for each living Broodmother, in units order
 *     hp ≤ maxHp·fleeAtHpFraction and not yet marked
 *       ──► fleeing: true, BroodmotherFleeing        (once, for good)
 *     fleeing and her block touches the map edge
 *       ──► off the map into `escaped`, BroodmotherEscaped
 * ```
 *
 * A Broodmother on the edge at full health is not escaping: she is
 * just standing there. One wounded on the edge turns and leaves in the
 * same step. Her escape is not a loss by itself — the mission ends on
 * its own rules, and Alpha Hunt's objective asks `broodmotherEscaped`.
 *
 * Draws nothing; a mission without a Broodmother comes back as it was.
 *
 * @param mission - The mission, its new phase and turn already set.
 * @param tuning - Her numbers.
 * @returns The mission after her flight, and its events.
 */
export function broodmotherFlight(
  mission: TacticalState,
  tuning: BroodmotherTuning = BROODMOTHER_TUNING,
): TacticalApplied<TacticalState> {
  let state = mission;
  const events: TacticalEvent[] = [];
  for (const unit of mission.units) {
    if (!isBroodmother(unit) || unit.hp <= 0 || !isFleeing(unit, tuning)) {
      continue;
    }
    if (unit.fleeing !== true) {
      const marked: Unit = { ...unit, fleeing: true };
      state = {
        ...state,
        units: state.units.map((u) => (u.id === unit.id ? marked : u)),
      };
      events.push({
        type: BROODMOTHER_FLEEING,
        payload: { unitId: unit.id, hp: unit.hp, maxHp: unit.maxHp },
      });
    }
    if (touchesMapEdge(state.map, unit.pos, unitFootprintSize(state, unit))) {
      state = leaveByMapEdge(state, unit.id);
      events.push({
        type: BROODMOTHER_ESCAPED,
        payload: { unitId: unit.id, pos: unit.pos, hp: unit.hp },
      });
    }
  }
  return { state, events };
}
