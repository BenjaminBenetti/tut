import type { Rng } from "../../core/model/rng";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type {
  TacticalApplied,
  TacticalEvent,
} from "../../tactical/model/tactical-event";
import type { TacticalContext } from "../../tactical/model/tactical-handler";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import type { MoveGraph } from "../../tactical/service/movement-service";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import { applyTacticalCommand } from "../../tactical/service/tactical-command-handlers";
import type { PhaseStep } from "../../tactical/service/turn-service";
import { missionOutcome } from "../../tactical/service/mission-end-service";
import { viewFor } from "../../tactical/service/mission-view-service";
import { withVision } from "../../tactical/service/vision-service";
import type { BehaviourLookup, SpeciesLookup } from "./behaviour-registry";
import { chooseBugCommands } from "./behaviour-registry";

// ===========================================
// Types
// ===========================================

/** What the bug phase runs on; the composition root supplies all four. */
export interface BugPhaseDeps {
  /** The action rules the bugs' commands go through; `EndTurn` is not among them. */
  readonly handlers: TacticalHandlers;
  /** Behaviours by species tag; a tag without one holds still. */
  readonly registry: BehaviourLookup;
  /** Resolves a bug's `sourceId` to its species. */
  readonly speciesOf: SpeciesLookup;
  /** What the behaviours price targets with. */
  readonly combat: CombatTuning;
}

// ===========================================
// Runner
// ===========================================

/**
 * The bug phase as a `PhaseStep` the turn engine runs after the phase
 * steps have opened the bugs phase (#335, GDD §6.4): every bug alive at
 * that point acts once, in `units` order, each choosing its commands
 * through its species' behaviour and having them applied through the
 * action handlers. The runner does not end the phase itself; the
 * `EndTurn` handler flips on to the player once it returns.
 *
 * ```
 *   for bug of living bugs (units order, snapshot at phase start):
 *     decided? ──► stop                        (the bugs wiped the squad)
 *     unitRng = ctx.rng.fork("bug:<id>")
 *     commands = behaviour.choose(mission, id, { rng: unitRng.fork("choose"), combat, graph })
 *     for command k: applyTacticalCommand(handlers, ..., { rng: unitRng.fork("command:k") })
 *                      err ──► stop this bug's remaining commands
 * ```
 *
 * Randomness: every draw comes off a labelled fork of the phase's own
 * stream, so the same seed and the same mission replay the same phase,
 * and one bug choosing differently never perturbs the next bug's draws.
 * A refused command (the behaviour planned a move the rules refuse, or
 * a rule that has not landed) ends that bug's turn quietly; the rest of
 * the phase still runs. The move graph is built at most once per phase,
 * on the first behaviour that reads it, and shared from there.
 */
export function createBugPhaseRunner(deps: BugPhaseDeps): PhaseStep {
  return (mission, ctx) => {
    if (mission.phase !== "bugs") {
      return { state: mission, events: [] };
    }
    const graphOnce = sharedGraph(mission);
    const actors = livingBugIds(mission);
    let state = mission;
    const events: TacticalEvent[] = [];
    for (const unitId of actors) {
      if (missionOutcome(state) !== undefined) {
        break;
      }
      const unitRng = ctx.rng.fork(`bug:${unitId}`);
      // Built per bug, not once per phase: the bug that acted before this
      // one may have walked into or out of sight of the squad, and a view
      // from the top of the phase would be a memory, not a look.
      const commands = chooseBugCommands(
        viewFor(state, "bugs"),
        unitId,
        deps.registry,
        deps.speciesOf,
        {
          rng: unitRng.fork("choose"),
          combat: deps.combat,
          get graph(): MoveGraph {
            return graphOnce();
          },
        },
      );
      const acted = applyAll(deps.handlers, state, commands, unitRng, ctx);
      // The phase applies commands straight through the handlers rather
      // than the lifting adapter, so the one site that keeps vision
      // current (ADR 0006 §2.2) is bypassed here. Without this the whole
      // phase would decide from the vision it started with, and a bug
      // walking into the open would stay invisible until the turn ended.
      const seen = withVision(acted, state);
      state = seen.state;
      events.push(...seen.events);
    }
    return { state, events };
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The mission map's move graph, built the first time a behaviour reads
 * `ctx.graph` and shared by every bug after it. Lazy because indexing a
 * map is O(tiles): a phase in which nothing walks — every bug holding
 * still because its species has no behaviour yet — never pays for it.
 */
function sharedGraph(mission: TacticalState): () => MoveGraph {
  let graph: MoveGraph | undefined;
  return () => (graph ??= buildMoveGraph(mission.map));
}

/** The living bugs' ids in `units` order: the phase's acting order. */
export function livingBugIds(mission: TacticalState): readonly UnitId[] {
  return mission.units
    .filter((unit) => unit.team === "bugs" && unit.hp > 0)
    .map((unit) => unit.id);
}

/**
 * Applies one bug's commands in order, each on its own labelled fork.
 * The first refusal ends the bug's turn: the plan has diverged from the
 * board it was made against, so the commands behind it are dropped
 * rather than forced through. Whatever landed before it stands.
 */
function applyAll(
  handlers: TacticalHandlers,
  mission: TacticalState,
  commands: readonly TacticalCommand[],
  unitRng: Rng,
  ctx: TacticalContext,
): TacticalApplied<TacticalState> {
  let state = mission;
  const events: TacticalEvent[] = [];
  for (const [k, command] of commands.entries()) {
    const outcome = applyTacticalCommand(handlers, state, command, {
      rng: unitRng.fork(`command:${String(k)}`),
      ids: ctx.ids,
    });
    if (!outcome.ok) {
      break;
    }
    state = outcome.value.state;
    events.push(...outcome.value.events);
  }
  return { state, events };
}
