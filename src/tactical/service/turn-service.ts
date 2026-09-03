import { ok } from "../../core/model/result";
import type { MissionOutcome } from "../../overworld/model/mission-result";
import type { CombatTuning } from "../model/combat-tuning";
import type { EndTurnCommand } from "../model/end-turn-command";
import { MISSION_ENDED } from "../model/mission-ended-event";
import type { StepReaction } from "../model/step-reaction";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type {
  TacticalContext,
  TacticalHandler,
} from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import { TURN_STARTED } from "../model/turn-started-event";
import type { Unit, UnitId, UnitStatus } from "../model/unit";
import { UNIT_STATUS_CHANGED } from "../model/unit-status-changed-event";
import { rollAttack, validateTargeting } from "./combat-service";

// ===========================================
// Types
// ===========================================

/**
 * One thing that happens when a phase begins, run in order over the
 * mission with the new phase and turn already set. The turn engine
 * ships `refreshSides`; spawning (#329) adds its waves the same way, as
 * the overworld's tick steps do for a day.
 */
export type PhaseStep = (
  mission: TacticalState,
  ctx: TacticalContext,
) => TacticalApplied<TacticalState>;

// ===========================================
// Phase steps
// ===========================================

/**
 * Readies the side whose phase begins and lets the other side's
 * suppression lapse (GDD §6.2):
 *
 * | side that acts now          | side that just finished |
 * |-----------------------------|-------------------------|
 * | `ap = maxAp`                | unchanged               |
 * | `overwatch` cleared (lapsed)| `suppressed` cleared    |
 *
 * Overwatch lasts until the watcher's next turn, so an unfired watch
 * lapses here; suppression laid on during the enemy's phase holds through
 * the victim's own phase and lifts once it has endured it. The dead are
 * left alone. No per-unit events: `TurnStarted` announces the refresh.
 */
export const refreshSides: PhaseStep = (mission) => {
  const acting = TEAM_FOR_PHASE[mission.phase];
  const units = mission.units.map((unit): Unit => {
    if (unit.hp <= 0) {
      return unit;
    }
    if (unit.team === acting) {
      return unit.ap === unit.maxAp && !unit.status.includes("overwatch")
        ? unit
        : {
            ...unit,
            ap: unit.maxAp,
            status: without(unit.status, "overwatch"),
          };
    }
    return unit.status.includes("suppressed")
      ? { ...unit, status: without(unit.status, "suppressed") }
      : unit;
  });
  return { state: { ...mission, units }, events: [] };
};

/** The steps every phase runs by default. */
export const DEFAULT_PHASE_STEPS: readonly PhaseStep[] = [refreshSides];

// ===========================================
// End turn
// ===========================================

/**
 * Builds the `EndTurn` handler (GDD §6.2). The terminal check comes
 * first, so a mission that is already decided ends without a spurious
 * new phase; otherwise the phase flips, the turn counter advances on the
 * bugs → player edge, `TurnStarted` is announced and the phase steps run.
 *
 * ```
 *   missionOutcome(mission) ──defined──► MissionEnded { outcome, turn }, outcome recorded
 *          │
 *   player ──► bugs (same turn)        bugs ──► player (turn + 1)
 *          │
 *   TurnStarted { turn, phase } ──► steps in order (refreshSides, then #329's waves …)
 * ```
 *
 * `early` on the payload is informational. Commands after the mission
 * has ended are refused by the lifting adapter (`mission-over`).
 */
export function createEndTurnHandler(
  steps: readonly PhaseStep[] = DEFAULT_PHASE_STEPS,
): TacticalHandler<EndTurnCommand> {
  return (mission, _command, ctx) => {
    const outcome = missionOutcome(mission);
    if (outcome !== undefined) {
      return ok({
        state: { ...mission, outcome },
        events: [
          { type: MISSION_ENDED, payload: { outcome, turn: mission.turn } },
        ],
      });
    }
    let state: TacticalState =
      mission.phase === "player"
        ? { ...mission, phase: "bugs" }
        : { ...mission, phase: "player", turn: mission.turn + 1 };
    const events: TacticalEvent[] = [
      { type: TURN_STARTED, payload: { turn: state.turn, phase: state.phase } },
    ];
    for (const step of steps) {
      const applied = step(state, ctx);
      state = applied.state;
      events.push(...applied.events);
    }
    return ok({ state, events });
  };
}

/**
 * Whether a terminal condition holds (GDD §6.3), and which:
 *
 * ```
 *   every objective complete (and there is one) ──► won
 *   no TDF unit standing on the map ─┬─ someone extracted ──► extracted
 *                                    └─ nobody extracted ───► lost
 *   otherwise ─────────────────────────────────────────────► undefined
 * ```
 *
 * Objectives win first: a force that finishes the job as its last unit
 * falls has still finished the job. #330 may call this after `Interact`
 * and `Extract` to end a mission mid-phase.
 */
export function missionOutcome(
  mission: TacticalState,
): MissionOutcome | undefined {
  if (
    mission.objectives.length > 0 &&
    mission.objectives.every((objective) => objective.complete)
  ) {
    return "won";
  }
  const standing = mission.units.some(
    (unit) => unit.team === "tdf" && unit.hp > 0,
  );
  if (standing) {
    return undefined;
  }
  return mission.extracted.length > 0 ? "extracted" : "lost";
}

// ===========================================
// Overwatch reactions
// ===========================================

/**
 * Every enemy on overwatch that can target the unit that just stepped
 * fires at it once, in `units` order, each shot consuming that watcher's
 * overwatch; a watcher that cannot see or reach the mover keeps watching
 * for a later step. Reaction shots skip the phase and action-point checks
 * (the watcher spent its actions going on watch) but obey range, sight,
 * and the same hit and damage formulae as a normal shot, drawing from the
 * move command's stream in order. Stops when the mover is down. A hidden
 * mover is never fired on.
 *
 * ```
 *   for watcher of enemies with `overwatch`:
 *     validateTargeting(watcher, mover) ok? ──► rollAttack (ap unchanged)
 *                                               overwatch removed, UnitStatusChanged
 *     mover down? ──► stop
 * ```
 */
export function overwatchReaction(
  mission: TacticalState,
  movedUnitId: UnitId,
  ctx: TacticalContext,
  tuning: CombatTuning,
): TacticalApplied<TacticalState> {
  const events: TacticalEvent[] = [];
  let state = mission;
  const mover = findUnit(state, movedUnitId);
  if (mover === undefined || mover.hp <= 0 || mover.status.includes("hidden")) {
    return { state, events };
  }
  const watcherIds = state.units
    .filter(
      (unit) =>
        unit.team !== mover.team &&
        unit.hp > 0 &&
        unit.status.includes("overwatch"),
    )
    .map((unit) => unit.id);
  for (const watcherId of watcherIds) {
    if ((findUnit(state, movedUnitId)?.hp ?? 0) <= 0) {
      break;
    }
    const checked = validateTargeting(state, watcherId, movedUnitId);
    if (!checked.ok) {
      continue;
    }
    const shot = rollAttack(
      state,
      checked.value,
      ctx,
      tuning,
      checked.value.attacker.ap,
    );
    events.push(...shot.events);
    const status = without(checked.value.attacker.status, "overwatch");
    state = {
      ...shot.state,
      units: shot.state.units.map((unit) =>
        unit.id === watcherId ? { ...unit, status } : unit,
      ),
    };
    events.push({
      type: UNIT_STATUS_CHANGED,
      payload: { unitId: watcherId, status },
    });
  }
  return { state, events };
}

/** The overwatch reaction as a `StepReaction` for `createMoveHandler`, closed over the tuning. */
export function createOverwatchReaction(tuning: CombatTuning): StepReaction {
  return (mission, movedUnitId, ctx) =>
    overwatchReaction(mission, movedUnitId, ctx, tuning);
}

// ===========================================
// Helpers
// ===========================================

/** The unit with the id, if it is in the mission. */
function findUnit(mission: TacticalState, unitId: UnitId): Unit | undefined {
  return mission.units.find((unit) => unit.id === unitId);
}

/** The status list without one status. */
function without(
  status: readonly UnitStatus[],
  removed: UnitStatus,
): readonly UnitStatus[] {
  return status.filter((entry) => entry !== removed);
}
