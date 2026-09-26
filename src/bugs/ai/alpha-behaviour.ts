import type { TileCoord } from "../../mapgen/model/tile-coord";
import { ATTACK, attack } from "../../tactical/model/attack-command";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import type { MissionView } from "../../tactical/model/mission-view";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import type { BehaviourLookup, SpeciesLookup } from "./behaviour-registry";
import { attackOptions } from "./utility";

// ===========================================
// Behaviour
// ===========================================

/**
 * The named alpha (campaign arc §8, §9, #1179): the `alpha` persona's
 * fallback, played by a bug Alpha Present crowned whenever Jev is not
 * driving it. It is still its species: it moves and chooses to fight
 * exactly as its species' own behaviour says, so an alpha lurker still
 * flanks and an alpha spitter still keeps its range. What the crown
 * adds is focus fire, which its persona's prompt asks Jev for too:
 *
 * ```
 *   species behaviour ──► [move?, attack?, …]
 *   each attack on a unit, from where the moves before it leave the bug:
 *     the living enemies it can hit from there (attackOptions)
 *     the one with the fewest hit points, if strictly fewer than the
 *     species' pick's ──► the attack is turned on it
 *     otherwise       ──► the species' pick stands
 *   a shot at a tile, or after a command it cannot follow (a tunnel,
 *   a burrow) ──► left as the species chose it
 * ```
 *
 * It reads nothing but the view it is handed, which is the bugs'
 * faction vision (ADR 0006 §2.3): "the weakest" is the weakest the
 * swarm can see, and a squad nobody has spotted is never in the running.
 * Draws nothing beyond what the species' behaviour draws from `ctx.rng`.
 */
export class AlphaBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag = "alpha" as const;
  private readonly behaviours: BehaviourLookup;
  private readonly speciesOf: SpeciesLookup;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param behaviours - Where the species' own behaviour is looked up:
   *   the registry this behaviour is registered in, in the app.
   * @param speciesOf - Resolves the bug's `sourceId` to its species.
   */
  constructor(behaviours: BehaviourLookup, speciesOf: SpeciesLookup) {
    this.behaviours = behaviours;
    this.speciesOf = speciesOf;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** The species' commands, with its attacks turned on the weakest target in reach. */
  choose(
    view: MissionView,
    unitId: UnitId,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const unit = view.units.find((candidate) => candidate.id === unitId);
    if (unit === undefined || unit.hp <= 0) {
      return [];
    }
    const tag = this.speciesOf(unit.sourceId)?.behaviour;
    const species =
      tag === undefined || tag === this.tag
        ? undefined
        : this.behaviours.get(tag);
    if (species === undefined) {
      return [];
    }
    return focusFire(view, unit, species.choose(view, unitId, ctx), ctx.combat);
  }
}

// ===========================================
// Focus fire
// ===========================================

/**
 * `commands` with every attack on a unit turned on the living enemy
 * with the fewest hit points the attacker can hit from where it stands
 * by then, when that enemy has strictly fewer than the one chosen; see
 * `AlphaBehaviour`. Pure: the view is never mutated.
 *
 * @param view - The mission as the bugs perceive it.
 * @param unit - The alpha, where it stands before its commands.
 * @param commands - Its species' commands, in dispatch order.
 * @param combat - Combat tuning, for which attacks are valid.
 * @returns The commands, attacks retargeted.
 */
export function focusFire(
  view: TacticalState,
  unit: Unit,
  commands: readonly TacticalCommand[],
  combat: CombatTuning,
): readonly TacticalCommand[] {
  let pos: TileCoord | undefined = unit.pos;
  return commands.map((command) => {
    if (command.type === MOVE) {
      pos = pos === undefined ? undefined : command.payload.path.at(-1);
      return command;
    }
    if (command.type !== ATTACK) {
      // A tunnel or a burrow moves it where this cannot follow.
      pos = undefined;
      return command;
    }
    const chosenId = command.payload.targetId;
    if (pos === undefined || chosenId === undefined) {
      return command;
    }
    const weakest = weakestInReach(view, unit, pos, combat);
    const chosen = view.units.find((candidate) => candidate.id === chosenId);
    if (
      weakest === undefined ||
      chosen === undefined ||
      weakest.hp >= chosen.hp
    ) {
      return command;
    }
    return attack(unit.id, weakest.id, command.payload.weaponId);
  });
}

/**
 * The living enemy with the fewest hit points `unit` could attack from
 * `pos`, the best-valued first on a tie (`attackOptions`' order), or
 * undefined when it can hit nothing there.
 */
function weakestInReach(
  view: TacticalState,
  unit: Unit,
  pos: TileCoord,
  combat: CombatTuning,
): Unit | undefined {
  const there: TacticalState = {
    ...view,
    units: view.units.map((candidate) =>
      candidate.id === unit.id ? { ...candidate, pos } : candidate,
    ),
  };
  let weakest: Unit | undefined;
  for (const option of attackOptions(there, unit.id, combat)) {
    if (weakest === undefined || option.target.hp < weakest.hp) {
      weakest = option.target;
    }
  }
  return weakest;
}
