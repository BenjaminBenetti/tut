import {
  jevFinished,
  startJevPhase,
  jevEndTurnPending,
  pendingJevTdf,
} from "./jev-control-service";
import { restingBugIds } from "./dormancy-service";
import { refreshMechSystems } from "./mech-heat-service";
import { err, ok } from "../../core/model/result";
import type { MissionOutcome } from "../../overworld/model/mission-result";
import type { CombatTuning } from "../model/combat-tuning";
import type { EndTurnCommand } from "../model/end-turn-command";
import { MISSION_ENDED } from "../model/mission-ended-event";
import type { PhaseStep } from "../model/phase-step";
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
import { isDormant } from "../model/unit";
import { UNIT_STATUS_CHANGED } from "../model/unit-status-changed-event";
import { isTrapped } from "../model/civilian";
import { leaveOverwatch, spendOverwatchShot } from "./overwatch-status";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { AttackDeps } from "./combat-service";
import { chargesLeft, rollAttack, validateTargeting } from "./combat-service";
import { unitFootprintTiles } from "./footprint-service";
import { missionOutcome } from "./mission-end-service";
import { unitCanSee } from "./vision-service";

// ===========================================
// Types
// ===========================================

/** Re-exported from the model, where the objective rules can name it (ADR 0013 §2.3). */
export type { PhaseStep } from "../model/phase-step";

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
 * lapses here, its shot count with it (#1138; a turret's is granted
 * again by `createTurretStep`, which runs after this); suppression laid
 * on during the enemy's phase holds through the victim's own phase and
 * lifts once it has endured it. The dead are left alone, and so is a
 * civilian group still trapped (campaign arc §6.4): it holds no action
 * points until Interact frees it. No per-unit events: `TurnStarted`
 * announces the refresh.
 */
export const refreshSides: PhaseStep = (mission) => {
  const acting = TEAM_FOR_PHASE[mission.phase];
  const units = mission.units.map((unit): Unit => {
    if (
      (unit.designatedUntilTurn ?? Infinity) <= mission.turn &&
      unit.designatedBy === acting
    ) {
      unit = {
        ...unit,
        designatedBy: undefined,
        designatedUntilTurn: undefined,
        designatedAccuracy: undefined,
      };
    }
    if (unit.hp <= 0 || isTrapped(unit)) {
      return unit;
    }
    if (unit.team === acting) {
      return refreshMechSystems(
        mission,
        unit.ap === unit.maxAp && !unit.status.includes("overwatch")
          ? unit
          : { ...leaveOverwatch(unit), ap: unit.maxAp },
      );
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
 * With a `bugPhase` runner (#335, `bugs/ai/bug-phase-runner`), the bugs
 * play their whole phase inside the player's `EndTurn`: after the bugs'
 * phase steps the runner acts for every bug, the terminal check runs
 * again (the bugs may have wiped the squad), and the phase flips on to
 * the next player turn in the same command. Without one, the bugs phase
 * is left open for a second `EndTurn`, as the headless sim (#343) and
 * the rules tests drive it.
 *
 * ```
 *   missionOutcome(mission) ──defined──► MissionEnded { outcome, turn }, outcome recorded
 *          │
 *   player ──► bugs (same turn)        bugs ──► player (turn + 1)
 *          │
 *   TurnStarted { turn, phase } ──► steps in order (refreshSides, then #329's waves …)
 *          │
 *   bugs phase and a runner? ──► runner acts ──► decided? MissionEnded
 *                                                       └─► player (turn + 1), TurnStarted, steps
 * ```
 *
 * `early` on the payload is informational. Commands after the mission
 * has ended are refused by the lifting adapter (`mission-over`).
 * Pending Jev TDF actors keep the player phase open with a saved End Turn
 * request; the app completes them and dispatches End Turn again afterward.
 */
export function createEndTurnHandler(
  steps: readonly PhaseStep[] = DEFAULT_PHASE_STEPS,
  bugPhase?: PhaseStep,
): TacticalHandler<EndTurnCommand> {
  return (mission, _command, ctx) => {
    const outcome = missionOutcome(mission);
    if (outcome !== undefined) {
      return ok(endMission(mission, outcome));
    }
    if (mission.phase === "player" && pendingJevTdf(mission)) {
      if (jevEndTurnPending(mission))
        return err({
          kind: "systems-unavailable",
          reason: "Jev units are finishing this turn",
        });
      const base =
        mission.jev?.activation?.turn === mission.turn &&
        mission.jev.activation.phase === mission.phase
          ? mission
          : startJevPhase(mission);
      return ok({
        state: {
          ...base,
          jev: {
            ...base.jev!,
            activation: { ...base.jev!.activation!, endTurnRequested: true },
          },
        },
        events: [],
      });
    }
    if (
      mission.phase === "bugs" &&
      mission.jev?.activation?.externalBugs &&
      unfinishedBugs(mission)
    ) {
      return err({
        kind: "systems-unavailable",
        reason: "The current bug activations have not finished",
      });
    }
    const opened = openNextPhase(mission, steps, ctx);
    if (
      opened.state.phase !== "bugs" ||
      bugPhase === undefined ||
      opened.state.jev?.activation?.externalBugs === true
    ) {
      return ok(endIfDecided(opened));
    }
    const played = bugPhase(opened.state, ctx);
    const events: TacticalEvent[] = [...opened.events, ...played.events];
    const decided = missionOutcome(played.state);
    if (decided !== undefined) {
      const ended = endMission(played.state, decided);
      return ok({ state: ended.state, events: [...events, ...ended.events] });
    }
    const next = endIfDecided(openNextPhase(played.state, steps, ctx));
    return ok({ state: next.state, events: [...events, ...next.events] });
  };
}

/**
 * Ends the mission if opening the phase decided it (#1121). The phase
 * steps can now kill: a fire burning at the start of the player phase
 * can take the last unit standing, and until the next `EndTurn` nobody
 * would have noticed. A phase that opened without deciding anything —
 * every phase before fires existed — is returned exactly as it came.
 */
function endIfDecided(
  opened: TacticalApplied<TacticalState>,
): TacticalApplied<TacticalState> {
  const outcome = missionOutcome(opened.state);
  if (outcome === undefined) {
    return opened;
  }
  const ended = endMission(opened.state, outcome);
  return { state: ended.state, events: [...opened.events, ...ended.events] };
}

/** Records the outcome on the mission and announces `MissionEnded`. */
function endMission(
  mission: TacticalState,
  outcome: MissionOutcome,
): TacticalApplied<TacticalState> {
  return {
    state: { ...mission, outcome },
    events: [{ type: MISSION_ENDED, payload: { outcome, turn: mission.turn } }],
  };
}

/**
 * Whether an externally driven bug phase still has a bug to act: a
 * living one Jev has not finished. A resting bug (`restingBugIds`, a
 * dormant brood) is not waiting to act, so it never holds the phase
 * open (#1179).
 */
function unfinishedBugs(mission: TacticalState): boolean {
  const resting = restingBugIds(mission);
  return mission.units.some(
    (unit) =>
      unit.team === "bugs" &&
      unit.hp > 0 &&
      !resting.has(unit.id) &&
      !jevFinished(mission, unit.id),
  );
}

/** Flips to the next phase, announces `TurnStarted` and runs the phase steps in order. */
function openNextPhase(
  mission: TacticalState,
  steps: readonly PhaseStep[],
  ctx: TacticalContext,
): TacticalApplied<TacticalState> {
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
  return { state: startJevPhase(state), events };
}

// ===========================================
// Overwatch reactions
// ===========================================

/**
 * Every enemy on overwatch that can target the unit that just stepped
 * fires at it once, in `units` order, each shot spending one of that
 * watcher's reaction shots (`spendOverwatchShot`): a squad's watch has
 * one and is clear after it, a turret's has two (#1138), so the turret
 * keeps watching and fires again at the mover's **next step**, or at
 * the next bug to move, whichever comes first. One shot per watcher per
 * step, never two at once: the loop is per step, and a second shot at
 * the same step would be a burst the numbers do not describe. A watcher
 * that cannot see or reach the mover keeps watching for a later step.
 * Reaction shots skip the phase and action-point checks (the watcher
 * spent its actions going on watch) but obey range, sight, and the same
 * hit and damage formulae as a normal shot, drawing from the move
 * command's stream in order. Stops when the mover is down. A hidden
 * mover is never fired on. A dormant bug (#1179) neither draws the fire
 * nor keeps a watch: asleep, it is not moving and not watching.
 *
 * ```
 *   for watcher of enemies with `overwatch`:
 *     validateTargeting(watcher, mover) ok? ──► rollAttack (ap unchanged)
 *                                               a shot spent; the last clears the
 *                                               watch and announces UnitStatusChanged
 *     mover down? ──► stop
 * ```
 */
export function overwatchReaction(
  mission: TacticalState,
  movedUnitId: UnitId,
  ctx: TacticalContext,
  tuning: CombatTuning,
  deps: AttackDeps,
): TacticalApplied<TacticalState> {
  const events: TacticalEvent[] = [];
  let state = mission;
  const mover = findUnit(state, movedUnitId);
  if (
    mover === undefined ||
    mover.hp <= 0 ||
    mover.status.includes("hidden") ||
    isDormant(mover)
  ) {
    return { state, events };
  }
  const watcherIds = state.units
    .filter(
      (unit) =>
        unit.team !== mover.team &&
        unit.hp > 0 &&
        unit.status.includes("overwatch") &&
        !isDormant(unit),
    )
    .map((unit) => unit.id);
  const index = new TileIndex(state.map);
  // A mover on a block (#1130) is in view when any tile of it is.
  const moverTiles = unitFootprintTiles(state, mover);
  for (const watcherId of watcherIds) {
    if ((findUnit(state, movedUnitId)?.hp ?? 0) <= 0) {
      break;
    }
    const watcher = findUnit(state, watcherId);
    if (watcher === undefined) continue;
    const personallyVisible = moverTiles.some((tile) =>
      unitCanSee(state, watcher, tile, index),
    );
    // The first ready damaging gun reacts. Indirect fire delegates spotting
    // to the same targeting validator as a commanded shot; direct fire still
    // requires the watcher's own eyes, even when its gun outranges them.
    const checked = (state.templates[watcher.templateId]?.weapons ?? [])
      .filter(
        (weapon) =>
          weapon.profile.damage > 0 &&
          chargesLeft(watcher, weapon) !== 0 &&
          (weapon.profile.indirect === true || personallyVisible),
      )
      .map((weapon) =>
        validateTargeting(state, watcherId, movedUnitId, tuning, weapon.id),
      )
      .find((result) => result.ok);
    if (!checked?.ok) continue;
    const shot = rollAttack(
      state,
      checked.value,
      ctx,
      tuning,
      checked.value.attacker.ap,
      deps,
    );
    events.push(...shot.events);
    const fired = findUnit(shot.state, watcherId);
    if (fired === undefined) {
      state = shot.state;
      continue;
    }
    const spent = spendOverwatchShot(fired);
    state = {
      ...shot.state,
      units: shot.state.units.map((unit) =>
        unit.id === watcherId ? spent : unit,
      ),
    };
    // The status is announced only when it changes: a turret that still
    // has a shot is still on overwatch, and saying so again is noise.
    if (!spent.status.includes("overwatch")) {
      events.push({
        type: UNIT_STATUS_CHANGED,
        payload: { unitId: watcherId, status: spent.status },
      });
    }
  }
  return { state, events };
}

/** The overwatch reaction as a `StepReaction` for `createMoveHandler`, closed over the tuning and the content. */
export function createOverwatchReaction(
  tuning: CombatTuning,
  deps: AttackDeps,
): StepReaction {
  return (mission, movedUnitId, ctx) =>
    overwatchReaction(mission, movedUnitId, ctx, tuning, deps);
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
