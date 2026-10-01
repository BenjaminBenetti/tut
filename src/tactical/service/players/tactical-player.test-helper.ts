import type { Result } from "../../../core/model/result";
import { abandonMission } from "../../model/abandon-mission-command";
import { endTurn } from "../../model/end-turn-command";
import type { TacticalCommand } from "../../model/tactical-command";
import type { TacticalState } from "../../model/tactical-state";
import type { UnitId } from "../../model/unit";
import { stagePending } from "../mission-stage-service";
import type { HomeBests } from "./home-progress.test-helper";
import {
  homeProgress,
  NO_HOME_PROGRESS,
  walksFarHome,
} from "./home-progress.test-helper";
import type { ObjectiveStrategies } from "./objective-strategy.test-helper";
import type { PlayerPolicy } from "./player-policy.test-helper";
import { planForce, underPlan } from "./player-policy.test-helper";
import { observe } from "./player-view.test-helper";

// ===========================================
// The driver (#1179, campaign arc §12)
// ===========================================
//
// One loop for both players: look, plan, ask the policy for the next
// unit's next command, apply it through the caller's rules, look again.
// The caller owns the rules and the dice (`apply`), so the same driver
// runs a fixture in a unit test and the shipped composition in the
// calibration matrix.
//
//   ┌─► observe ──► planForce ──► policy.assign ──► orders
//   │      unit = first not done in policy.actingOrder
//   │      command = policy.next(unit, underPlan(orders[unit]))
//   │        ├── none     ──► unit done
//   │        ├── refused  ──► unit done (counted)
//   └────────┴── applied  ──► mission'
//   every unit done ──► EndTurn ──► next turn … outcome, or
//   the cap, or STALL_TURNS settled with nobody getting out ──► AbandonMission
//   (nor, where the strategy says the walk home is long, getting nearer)
//
// A linked mission (the Spore Platform) is played stage by stage: a won
// stage with another after it goes straight on through the caller's
// `advance`, each stage with its own cap, as one run.
//
//   stage 0 ──► won ∧ stagePending ──► advance ──► stage 1 ──► … outcome

/** A modelled player: how it plays, and how it reads each objective. */
export interface TacticalPlayer {
  readonly policy: PlayerPolicy;
  readonly strategies: ObjectiveStrategies;
}

/** Applies one command with the caller's rules: the next mission, or why it was refused. */
export type CommandApplier = (
  mission: TacticalState,
  command: TacticalCommand,
) => Result<TacticalState, string>;

/**
 * Starts the next stage of a linked mission whose stage has just been
 * won, with the caller's rules: the next map, or why it was refused.
 */
export type StageAdvance = (
  mission: TacticalState,
) => Result<TacticalState, string>;

/** What one player phase did. */
export interface PhaseReport {
  readonly mission: TacticalState;
  readonly commands: number;
  /** Refusal codes, one per refused command, in order. */
  readonly refused: readonly string[];
}

/** Why the force abandoned a mission, when it did. */
export type AbandonReason = "cap" | "stall";

/** What a whole mission did. */
export interface MissionPlay {
  readonly mission: TacticalState;
  /** Turns begun, over every stage played. */
  readonly turns: number;
  /** Turns begun on each stage played, in order; one entry on a one-map mission. */
  readonly stageTurns: readonly number[];
  /** True when the force abandoned the map it ended on: at the turn cap, or stalled. */
  readonly capped: boolean;
  /** Why that map was abandoned; undefined when it ended on its own. */
  readonly abandoned?: AbandonReason;
  readonly commands: number;
  readonly refused: readonly string[];
}

/** Bounds on one phase, so a policy that loops cannot hang a run. */
export interface PhaseLimits {
  readonly perUnit: number;
  readonly perPhase: number;
}

/** The shipped bounds: more than any unit's actions need. */
export const PHASE_LIMITS: PhaseLimits = { perUnit: 12, perPhase: 200 };

/**
 * Turns the force waits, once every deciding objective is settled, for
 * anyone else to get out before it gives up on the rest and abandons:
 * a unit boxed in on its way home is left behind, as a player would.
 * Where a strategy says the walk home is long, a unit getting nearer
 * home restarts the wait too.
 */
export const STALL_TURNS = 10;

// ===========================================
// Playing
// ===========================================

/**
 * Plays the TDF phase: every unit that takes orders acts until its
 * policy says it is done. Does not end the turn. Deterministic: reads
 * nothing but the mission and the player.
 */
export function playPlayerPhase(
  mission: TacticalState,
  player: TacticalPlayer,
  apply: CommandApplier,
  limits: PhaseLimits = PHASE_LIMITS,
): PhaseReport {
  let current = mission;
  const done = new Set<UnitId>();
  const issued = new Map<UnitId, number>();
  const refused: string[] = [];
  let commands = 0;
  while (current.outcome === undefined && commands < limits.perPhase) {
    const view = observe(current);
    const unitId = player.policy.actingOrder(view).find((id) => !done.has(id));
    const unit = view.own.find((candidate) => candidate.id === unitId);
    if (unit === undefined) {
      break;
    }
    const plan = planForce(view, player.strategies);
    const order = player.policy.assign(view, plan).get(unit.id);
    const command =
      order === undefined
        ? undefined
        : player.policy.next(unit, underPlan(order, plan), view);
    if (command === undefined) {
      done.add(unit.id);
      continue;
    }
    commands += 1;
    const count = (issued.get(unit.id) ?? 0) + 1;
    issued.set(unit.id, count);
    if (count >= limits.perUnit) {
      done.add(unit.id);
    }
    const applied = apply(current, command);
    if (!applied.ok) {
      refused.push(`${command.type}:${applied.error}`);
      done.add(unit.id);
      continue;
    }
    current = applied.value;
  }
  return { mission: current, commands, refused };
}

/**
 * Plays the mission to its end: player phase, EndTurn, and again, until
 * it has an outcome. The force abandons a stage at `turnCap` turns, or
 * once the objectives are settled and nobody has got out for
 * `STALL_TURNS` turns (nor, on a long walk home, got nearer), so every
 * run ends with a result. A won stage of a linked mission goes on to the
 * next through `advance`; a linked mission played without one throws,
 * rather than end on its first map.
 */
export function playMission(
  mission: TacticalState,
  player: TacticalPlayer,
  apply: CommandApplier,
  turnCap: number,
  advance?: StageAdvance,
): MissionPlay {
  let play = playStage(mission, player, apply, turnCap);
  while (stagePending(play.mission)) {
    if (advance === undefined) {
      throw new Error("stage pending: no advance to play the next map");
    }
    const next = advance(play.mission);
    if (!next.ok) {
      throw new Error(`advance refused: ${next.error}`);
    }
    const stage = playStage(next.value, player, apply, turnCap);
    play = {
      ...stage,
      turns: play.turns + stage.turns,
      stageTurns: [...play.stageTurns, ...stage.stageTurns],
      commands: play.commands + stage.commands,
      refused: [...play.refused, ...stage.refused],
    };
  }
  return play;
}

// ===========================================
// Private
// ===========================================

/**
 * Plays one map to its outcome: player phase, EndTurn, and again,
 * abandoning it at `turnCap` turns or after `STALL_TURNS` settled turns
 * with nobody getting out (nor, on a long walk home, getting nearer).
 */
function playStage(
  mission: TacticalState,
  player: TacticalPlayer,
  apply: CommandApplier,
  turnCap: number,
): MissionPlay {
  let current = mission;
  let commands = 0;
  const refused: string[] = [];
  const first = mission.turn;
  let waiting = 0;
  let out = mission.extracted.length;
  let bests: HomeBests = NO_HOME_PROGRESS.bests;
  while (current.outcome === undefined) {
    const reason: AbandonReason | undefined =
      current.turn - first >= turnCap
        ? "cap"
        : waiting >= STALL_TURNS
          ? "stall"
          : undefined;
    if (reason !== undefined) {
      const abandoned = apply(current, abandonMission());
      if (!abandoned.ok) {
        throw new Error(`abandon refused: ${abandoned.error}`);
      }
      const turns = current.turn - first + 1;
      return {
        mission: abandoned.value,
        turns,
        stageTurns: [turns],
        capped: true,
        abandoned: reason,
        commands,
        refused,
      };
    }
    const phase = playPlayerPhase(current, player, apply);
    current = phase.mission;
    commands += phase.commands;
    refused.push(...phase.refused);
    if (current.outcome !== undefined) {
      break;
    }
    const ended = apply(current, endTurn());
    if (!ended.ok) {
      throw new Error(`end turn refused: ${ended.error}`);
    }
    current = ended.value;
    const view = observe(current);
    const settled = planForce(view, player.strategies).settled;
    const walk =
      settled && walksFarHome(view, player.strategies)
        ? homeProgress(view, bests)
        : NO_HOME_PROGRESS;
    bests = walk.bests;
    waiting =
      settled && current.extracted.length === out && !walk.nearer
        ? waiting + 1
        : 0;
    out = current.extracted.length;
  }
  const turns = current.turn - first + 1;
  return {
    mission: current,
    turns,
    stageTurns: [turns],
    capped: false,
    commands,
    refused,
  };
}
