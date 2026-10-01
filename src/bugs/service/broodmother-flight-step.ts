import { BROODMOTHER_ESCAPED } from "../../tactical/model/broodmother-escaped-event";
import { BROODMOTHER_FLEEING } from "../../tactical/model/broodmother-fleeing-event";
import type { PhaseStep } from "../../tactical/model/phase-step";
import type {
  TacticalApplied,
  TacticalEvent,
} from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { TEAM_FOR_PHASE } from "../../tactical/model/tactical-state";
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
 * reached the edge in the bugs' phase is gone before the player's. It
 * runs after the phase's refresh, so the limp it leaves her is what
 * her phase plays with.
 *
 * @param tuning - Her numbers (the flee threshold and her limp); the shipped set by default.
 * @returns The step.
 */
export function createBroodmotherFlightStep(
  tuning: BroodmotherTuning = BROODMOTHER_TUNING,
): PhaseStep {
  return (mission) => broodmotherFlight(mission, tuning);
}

/**
 * Marks, slows and removes fleeing Broodmothers. The rules half of her
 * flight — the behaviour, or Jev, does the running:
 *
 * ```
 *   for each living Broodmother, in units order
 *     hp ≤ maxHp·fleeAtHpFraction and not yet marked
 *       ──► fleeing: true, BroodmotherFleeing        (once, for good)
 *     fleeing, as her own phase opens, ap > fleeingActions
 *       ──► ap = fleeingActions                      (wounded, she limps)
 *     fleeing and her block touches the map edge
 *       ──► off the map into `escaped`, BroodmotherEscaped
 * ```
 *
 * The limp is the hunt's (C3b-story, phase 5): at one action a phase
 * she runs 5 tiles a turn, not 10, so a squad that wounded her from
 * the middle of the map can still catch her before the edge. It is
 * hers, not the species': her walk while she is whole is untouched.
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
  const acting = TEAM_FOR_PHASE[mission.phase];
  for (const unit of mission.units) {
    if (!isBroodmother(unit) || unit.hp <= 0 || !isFleeing(unit, tuning)) {
      continue;
    }
    const herTurn = unit.team === acting;
    const running = unit.fleeing === true;
    const limping = herTurn && unit.ap > tuning.fleeingActions;
    if (!running || limping) {
      const marked: Unit = {
        ...unit,
        fleeing: true,
        ap: limping ? tuning.fleeingActions : unit.ap,
      };
      state = {
        ...state,
        units: state.units.map((u) => (u.id === unit.id ? marked : u)),
      };
    }
    if (!running) {
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
