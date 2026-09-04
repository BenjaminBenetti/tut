import type { TileCoord } from "../../mapgen/model/tile-coord";
import { attack } from "../../tactical/model/attack-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import {
  apCostOf,
  buildMoveGraph,
} from "../../tactical/service/movement-service";
import { SWARMER_TUNING } from "../data/swarmer-tuning";
import type { SwarmerTuning } from "../model/swarmer-tuning";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import {
  attackOptions,
  bestBy,
  clumpScore,
  livingAllies,
  livingEnemies,
  moveTowards,
  nearestEnemy,
  reachableTiles,
  tileDistance,
} from "./utility";

// ===========================================
// Behaviour
// ===========================================

/**
 * The swarmer (GDD §6.4): fast, weak and numerous, so it simply comes at
 * you. Each turn it bites whatever it can already reach, and otherwise
 * runs at the nearest TDF unit, preferring the reachable tile that both
 * closes the most distance and puts it shoulder to shoulder with its own
 * kind — then bites from there if the run left it an action point.
 *
 * ```
 *   target = nearest living enemy
 *   something in reach? ──yes──► [attack best value]
 *        │no
 *   tile = argmax( −distance·w + adjacent·w + kin·w − levels·w )
 *        │
 *        ├─ beats standing still ──► [move] ─ AP left and in reach ─► [move, attack]
 *        └─ else                  ──► []
 * ```
 *
 * On level ground the distance term dominates every reward (see
 * `SWARMER_TUNING`), so whenever a strictly closer tile is reachable the
 * swarmer takes one: closing every turn is an invariant of the weights,
 * and company only decides between tiles that close the same distance.
 * An attack ends the unit's turn (`attackEndsTurn`), so a turn is at most
 * one move and one bite.
 */
export class SwarmerBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag = "rush" as const;
  private readonly tuning: SwarmerTuning;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param tuning - Scoring weights; the shipped set by default. */
  constructor(tuning: SwarmerTuning = SWARMER_TUNING) {
    this.tuning = tuning;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** The swarmer's commands for this turn. */
  choose(
    mission: TacticalState,
    unitId: UnitId,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const unit = mission.units.find((u) => u.id === unitId);
    if (unit === undefined || unit.hp <= 0) {
      return [];
    }
    const enemies = livingEnemies(mission, unit);
    if (enemies.length === 0) {
      return [];
    }

    // Already in reach: bite, best expected value first.
    const standing = attackOptions(mission, unitId, ctx.combat)[0];
    if (standing) {
      return [attack(unitId, standing.target.id)];
    }

    const target = nearestEnemy(mission, unit) ?? enemies[0]!;
    const kin = this.kinOf(mission, unit);
    const graph = ctx.graph ?? buildMoveGraph(mission.map);
    const best = bestBy(
      reachableTiles(mission, unitId, graph),
      (t) => this.scoreTile(t.tile, target, kin),
      ctx.rng,
    );
    if (
      best === undefined ||
      this.scoreTile(best.tile, target, kin) <=
        this.scoreTile(unit.pos, target, kin)
    ) {
      // Boxed in: nothing reachable beats the tile it already holds.
      return [];
    }
    const step = moveTowards(mission, unitId, best.tile, graph);
    if (step === undefined) {
      return [];
    }
    const commands: TacticalCommand[] = [step];

    // After closing: bite if the run left an action point and something is in reach.
    const apAfter = unit.ap - apCostOf(mission, unit, step.payload.path.length);
    const moved: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === unitId ? { ...u, pos: best.tile, ap: apAfter } : u,
      ),
    };
    const follow = attackOptions(moved, unitId, ctx.combat)[0];
    if (follow) {
      commands.push(attack(unitId, follow.target.id));
    }
    return commands;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * The living allies of the same species — the swarm this one groups up
   * with. Keyed on `sourceId` rather than on the behaviour tag so a later
   * rusher does not dilute a swarmer's idea of its own kind.
   */
  private kinOf(mission: TacticalState, unit: Unit): readonly Unit[] {
    return livingAllies(mission, unit).filter(
      (a) => a.sourceId === unit.sourceId,
    );
  }

  /**
   * The swarmer's utility for standing on `tile` this turn: distance to
   * the target dominates, adjacency and company break ties, height
   * difference is discouraged.
   */
  private scoreTile(
    tile: TileCoord,
    target: Unit,
    kin: readonly Unit[],
  ): number {
    const t = this.tuning;
    const distance = tileDistance(tile, target.pos);
    const adjacent = distance === 1 && tile.y === target.pos.y ? 1 : 0;
    const company = clumpScore(tile, kin, t.swarmRadius);
    const levels = Math.abs(tile.y - target.pos.y);
    return (
      -distance * t.approachWeight +
      adjacent * t.adjacentWeight +
      company * t.swarmWeight -
      levels * t.levelWeight
    );
  }
}
