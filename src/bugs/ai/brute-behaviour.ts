import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import { attack } from "../../tactical/model/attack-command";
import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import {
  apCostOf,
  buildMoveGraph,
} from "../../tactical/service/movement-service";
import { BRUTE_TUNING } from "../data/brute-tuning";
import type { BruteTuning } from "../model/brute-tuning";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import {
  attackOptions,
  bestBy,
  clumpScore,
  livingEnemies,
  moveTowards,
  overwatchScore,
  reachableTiles,
  targetValue,
  tileDistance,
} from "./utility";

// ===========================================
// Behaviour
// ===========================================

/**
 * The brute (GDD §6.4): slow, armored, and it punishes clumping. It
 * picks the enemy standing in the thickest part of the line as its
 * focus, then walks at the reachable tile that puts it in contact with
 * as many bodies as possible — taking a detour to touch two soldiers
 * rather than one — and swings from there.
 *
 * ```
 *   focus = the enemy with the most company around it
 *   tile  = argmax( adjacentCount·w − distance(focus)·w
 *                   + clump·w + watched·w − levels·w )
 *        │
 *        ├─ beats standing still ──► [move] ─ AP left and in reach ─► [move, attack]
 *        └─ else                  ──► [attack best value] or []
 * ```
 *
 * Two things it deliberately does *not* do, both required by #334:
 *
 * - **It ignores cover.** There is no cover or exposure term in the
 *   score at all, unlike the lurker. A brute takes the tile in the open
 *   beside three soldiers over the sheltered one beside none, and never
 *   pays to be unseen.
 * - **It soaks overwatch.** `overwatchScore` enters the score as a
 *   reward rather than a cost. A reaction shot spends the watcher's
 *   overwatch
 *   (`overwatchReaction` in `turn-service`), so a brute that walks into
 *   the beaten zone eats the shots its armor is built for and the
 *   swarmers behind it arrive untouched. The weight is small enough to
 *   break ties between equally good tiles rather than to steer the
 *   advance into a detour.
 *
 * Unlike the swarmer, the brute does not swing at whatever it can
 * already reach before considering a move: standing still is scored as
 * just another tile, so a brute in contact with one straggler will walk
 * off it into a crowd. It only attacks from where it stands when no
 * reachable tile is worth more than the tile it holds.
 */
export class BruteBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag = "punish-clumps" as const;
  private readonly tuning: BruteTuning;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param tuning - Scoring weights; the shipped set by default. */
  constructor(tuning: BruteTuning = BRUTE_TUNING) {
    this.tuning = tuning;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** The brute's commands for this turn. */
  choose(
    // The mission as the bugs perceive it (ADR 0006 §2.3): enemies this
    // side has not spotted are simply not in `mission.units`.
    mission: MissionView,
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
    const index = new TileIndex(mission.map);
    const focus = this.pickFocus(mission, unit, enemies, ctx);
    const score = (tile: TileCoord): number =>
      this.scoreTile(mission, tile, focus, enemies, index);

    const graph = ctx.graph ?? buildMoveGraph(mission.map);
    const best = bestBy(
      reachableTiles(mission, unitId, graph),
      (t) => score(t.tile),
      ctx.rng,
    );
    if (best === undefined || score(best.tile) <= score(unit.pos)) {
      // Already in the thick of it, or boxed in: swing where it stands.
      return this.swing(mission, unitId, ctx);
    }
    const step = moveTowards(mission, unitId, best.tile, graph);
    if (step === undefined) {
      return this.swing(mission, unitId, ctx);
    }
    const commands: TacticalCommand[] = [step];

    // After wading in: swing if the walk left an action point.
    const apAfter = unit.ap - apCostOf(mission, unit, step.payload.path.length);
    const moved: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === unitId ? { ...u, pos: best.tile, ap: apAfter } : u,
      ),
    };
    return [...commands, ...this.swing(moved, unitId, ctx)];
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * The enemy standing in the thickest part of the line: the one with
   * the most company within `clumpRadius`, ties broken by how much a hit
   * on it would be worth. This is the anchor the advance closes on when
   * nothing is in contact yet.
   */
  private pickFocus(
    mission: TacticalState,
    unit: Unit,
    enemies: readonly Unit[],
    ctx: BehaviourContext,
  ): Unit {
    const index = new TileIndex(mission.map);
    const chosen = bestBy(
      enemies,
      (enemy) => {
        const company = clumpScore(
          enemy.pos,
          enemies.filter((e) => e.id !== enemy.id),
          this.tuning.clumpRadius,
        );
        const value = targetValue(
          mission,
          unit,
          unit.pos,
          enemy,
          ctx.combat,
          index,
        ).value;
        return company * this.tuning.clumpWeight + value * 0.5;
      },
      ctx.rng,
    );
    return chosen ?? enemies[0]!;
  }

  /** An attack on the best target the unit can reach from where it stands, if any. */
  private swing(
    mission: TacticalState,
    unitId: UnitId,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const option = attackOptions(mission, unitId, ctx.combat)[0];
    return option ? [attack(unitId, option.target.id)] : [];
  }

  /**
   * The brute's utility for standing on `tile` this turn: bodies in
   * contact dominate, distance to the focus decides while nothing is in
   * contact, and a crowd nearby and guns trained on the tile break ties.
   * No cover term — that absence is the behaviour.
   */
  private scoreTile(
    mission: TacticalState,
    tile: TileCoord,
    focus: Unit,
    enemies: readonly Unit[],
    index: TileIndex,
  ): number {
    const t = this.tuning;
    const adjacent = adjacentCount(tile, enemies);
    const distance = tileDistance(tile, focus.pos);
    const crowd = clumpScore(tile, enemies, t.clumpRadius);
    const watched = overwatchScore(mission, tile, enemies, index);
    const levels = Math.abs(tile.y - focus.pos.y);
    return (
      adjacent * t.adjacentWeight -
      distance * t.approachWeight +
      crowd * t.clumpWeight +
      watched * t.overwatchWeight -
      levels * t.levelWeight
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Living enemies standing orthogonally adjacent to `tile` on its own
 * level — the ones a brute standing there could swing at. Counted rather
 * than scored as a fraction, so a second body in contact is always worth
 * as much as the first.
 */
export function adjacentCount(
  tile: TileCoord,
  enemies: readonly Unit[],
): number {
  return enemies.filter(
    (e) => e.pos.y === tile.y && tileDistance(tile, e.pos) === 1,
  ).length;
}
