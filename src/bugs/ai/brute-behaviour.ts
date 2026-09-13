import type { Direction } from "../../core/model/direction";
import { STOREY_LAYERS } from "../../core/model/elevation";
import { stepGridPos } from "../../core/service/grid-math";
import { allows, PassMask } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { wallKindBlocks } from "../../mapgen/service/reachability-service";
import { TileIndex } from "../../mapgen/service/tile-index";
import { attack, attackTile } from "../../tactical/model/attack-command";
import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { validateTileAttack } from "../../tactical/service/combat-service";
import {
  footprintTiles,
  unitFootprintSize,
} from "../../tactical/service/footprint-service";
import {
  apCostOf,
  buildMoveGraph,
} from "../../tactical/service/movement-service";
import { BRUTE_TUNING } from "../data/brute-tuning";
import type { BruteTuning } from "../model/brute-tuning";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import {
  advanceToward,
  attackOptions,
  bestBy,
  clumpScore,
  footprintDistance,
  landingSite,
  livingEnemies,
  moveTowards,
  overwatchScore,
  reachableTiles,
  recalledSite,
  rememberedEnemy,
  targetValue,
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
 *
 * Since #1130 the brute stands on a 2×2 block, so every tile it scores
 * is an anchor and "in contact" means any tile of the block beside the
 * enemy; and when it has nothing to swing at — a squad indoors, behind
 * a wall its four tiles fit through no door of — it **cuts**: it fires
 * its cleavers at the wall or prop between it and the enemy it knows
 * of, spotted or remembered, and walks through the gap next turn.
 *
 * ```
 *   swing?  attack option in reach ──► [attack]
 *   else    wall or prop on the line to the enemy, beside the block
 *             ──► [attack tile]  (force 3 opens the wall, #1121)
 * ```
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
      return this.hunt(mission, unit, ctx);
    }
    const index = new TileIndex(mission.map);
    const size = unitFootprintSize(mission, unit);
    const focus = this.pickFocus(mission, unit, enemies, ctx);
    const score = (tile: TileCoord): number =>
      this.scoreTile(mission, tile, size, focus, enemies, index);

    const graph = ctx.graph ?? buildMoveGraph(mission.map);
    const best = bestBy(
      reachableTiles(mission, unitId, graph),
      (t) => score(t.tile),
      ctx.rng,
    );
    if (best === undefined || score(best.tile) <= score(unit.pos)) {
      // Already in the thick of it, or boxed in: swing where it stands,
      // or cut toward the focus when nothing is in reach.
      return this.swingOrCut(mission, unitId, focus.pos, ctx);
    }
    const step = moveTowards(mission, unitId, best.tile, graph);
    if (step === undefined) {
      return this.swingOrCut(mission, unitId, focus.pos, ctx);
    }
    const commands: TacticalCommand[] = [step];

    // After wading in: swing if the walk left an action point.
    const moved = this.afterMove(mission, unit, best.tile, step.payload.path);
    return [...commands, ...this.swingOrCut(moved, unitId, focus.pos, ctx)];
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

  /**
   * Nothing in view, so lumber toward where the enemy was last seen, or
   * failing that where it came down (#559, #716). Approach and nothing
   * else: a brute has no crowd to punish yet and takes no interest in
   * cover, so its walk is the plainest of the three — which is the
   * point, the gait should still be its own. A remembered enemy it
   * cannot walk to gets the cleavers instead (#1130): with an action
   * point left after the walk, or with no walk worth making, the brute
   * cuts the wall between it and the memory.
   */
  private hunt(
    mission: MissionView,
    unit: Unit,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const site = recalledSite(mission, unit) ?? landingSite(mission, unit.pos);
    const remembered = rememberedEnemy(mission, unit);
    if (site === undefined) {
      return remembered === undefined
        ? []
        : this.cut(mission, unit.id, remembered, ctx);
    }
    const t = this.tuning;
    const size = unitFootprintSize(mission, unit);
    const step = advanceToward(
      mission,
      unit.id,
      (tile) =>
        -footprintDistance(tile, size, site) * t.approachWeight -
        Math.abs(tile.y - site.y) * t.levelWeight,
      ctx.graph ?? buildMoveGraph(mission.map),
      ctx.rng,
    );
    if (remembered === undefined) {
      return step ? [step] : [];
    }
    if (step === undefined) {
      return this.cut(mission, unit.id, remembered, ctx);
    }
    const to = step.payload.path.at(-1) ?? unit.pos;
    const moved = this.afterMove(mission, unit, to, step.payload.path);
    return [step, ...this.cut(moved, unit.id, remembered, ctx)];
  }

  /**
   * An attack on the best target the unit can reach from where it
   * stands; failing that, a cut at whatever structure stands between it
   * and `toward` (#1130); failing that, nothing.
   */
  private swingOrCut(
    mission: TacticalState,
    unitId: UnitId,
    toward: TileCoord,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const option = attackOptions(mission, unitId, ctx.combat)[0];
    if (option !== undefined) {
      return [attack(unitId, option.target.id)];
    }
    return this.cut(mission, unitId, toward, ctx);
  }

  /**
   * The cleavers into the wall (#1130): a shot at the ground that brings
   * down the structure between the brute and `toward`, so the brute can
   * walk through next turn. The impact is chosen by `breachTarget` and
   * the shot is only issued when the rules would accept it — enough
   * action points, a tile in reach — so a refused plan never ends the
   * brute's turn early.
   */
  private cut(
    mission: TacticalState,
    unitId: UnitId,
    toward: TileCoord,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const unit = mission.units.find((u) => u.id === unitId);
    if (unit === undefined) {
      return [];
    }
    const impact = breachTarget(
      mission,
      unit.pos,
      unitFootprintSize(mission, unit),
      toward,
    );
    if (impact === undefined) {
      return [];
    }
    return validateTileAttack(mission, unitId, impact, ctx.combat).ok
      ? [attackTile(unitId, impact)]
      : [];
  }

  /** The mission as it will stand once the unit has walked `path` to `to`, its action points spent. */
  private afterMove(
    mission: TacticalState,
    unit: Unit,
    to: TileCoord,
    path: readonly TileCoord[],
  ): TacticalState {
    const apAfter = unit.ap - apCostOf(mission, unit, path.length);
    return {
      ...mission,
      units: mission.units.map((u) =>
        u.id === unit.id ? { ...u, pos: to, ap: apAfter } : u,
      ),
    };
  }

  /**
   * The brute's utility for standing anchored on `tile` this turn:
   * bodies in contact dominate, distance to the focus decides while
   * nothing is in contact, and a crowd nearby and guns trained on the
   * tile break ties. Contact, distance and crowd are measured from the
   * whole block (#1130); the overwatch term reads the anchor, since it
   * only ever breaks ties. No cover term — that absence is the
   * behaviour.
   */
  private scoreTile(
    mission: TacticalState,
    tile: TileCoord,
    size: number,
    focus: Unit,
    enemies: readonly Unit[],
    index: TileIndex,
  ): number {
    const t = this.tuning;
    const adjacent = adjacentCount(tile, enemies, size);
    const distance = footprintDistance(tile, size, focus.pos);
    const crowd = clumpScore(tile, enemies, t.clumpRadius, size);
    const watched = overwatchScore(mission, tile, enemies, index);
    const levels = Math.abs(tile.y - focus.pos.y) / STOREY_LAYERS;
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
 * Living enemies standing orthogonally adjacent to the block of `size`
 * tiles a side anchored at `tile`, on its own level — the ones a brute
 * standing there could swing at. Counted rather than scored as a
 * fraction, so a second body in contact is always worth as much as the
 * first. One tile, the default, is adjacency to that tile alone.
 */
export function adjacentCount(
  tile: TileCoord,
  enemies: readonly Unit[],
  size = 1,
): number {
  return enemies.filter(
    (e) => e.pos.y === tile.y && footprintDistance(tile, size, e.pos) === 1,
  ).length;
}

/**
 * The tile a brute at `anchor` should fire its cleavers at to open the
 * way toward `toward` (#1130), or undefined when nothing stands in the
 * way beside it. The candidates are the block's own tiles that carry a
 * wall the brute cannot pass on a side facing the enemy — the shot is
 * aimed at the brute's own tile, because the wall is on its edge and
 * the blast cannot see through it to the far side — and the impassable
 * prop tiles beside the block on those sides. The one nearest the enemy
 * wins; ties keep footprint order.
 *
 * ```
 *   brute B B │ squad      facing side: e     wall on B's east edge
 *         B B │            ──► aim at that B; the sweep (blast 1) takes
 *                              every edge of it, the wall among them
 * ```
 *
 * Only the sides toward the enemy are tried, so a brute never cuts away
 * from what it is hunting; whether the force suffices is the rules'
 * business, and a wall too thick for it costs the shot and teaches
 * nothing new, which is what a brute would do.
 *
 * @param mission - The mission as the bugs perceive it.
 * @param anchor - The brute's anchor tile.
 * @param size - Its tiles per side.
 * @param toward - Where the enemy is, or was last seen.
 * @returns The tile to aim at, or undefined.
 */
export function breachTarget(
  mission: TacticalState,
  anchor: TileCoord,
  size: number,
  toward: TileCoord,
): TileCoord | undefined {
  const index = new TileIndex(mission.map);
  let best: TileCoord | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  const consider = (impact: TileCoord, beyond: TileCoord): void => {
    const distance =
      Math.abs(beyond.x - toward.x) + Math.abs(beyond.z - toward.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: impact.x, y: impact.y, z: impact.z };
    }
  };
  for (const cell of footprintTiles(anchor, size)) {
    const tile = index.getAt(cell);
    if (tile === undefined) {
      continue;
    }
    for (const side of sidesToward(cell, toward)) {
      const beyond = stepGridPos(cell, side);
      if (wallKindBlocks(tile.walls[side], PassMask.INFANTRY)) {
        consider(cell, beyond);
        continue;
      }
      const next = index.getAt(beyond);
      if (next?.propId !== undefined && !allows(next.pass, PassMask.INFANTRY)) {
        consider(next, beyond);
      }
    }
  }
  return best;
}

/** The one or two sides of `from` that face `toward`; none when they share a column. */
function sidesToward(from: TileCoord, toward: TileCoord): Direction[] {
  const sides: Direction[] = [];
  const dx = toward.x - from.x;
  const dz = toward.z - from.z;
  if (dx !== 0) {
    sides.push(dx > 0 ? "e" : "w");
  }
  if (dz !== 0) {
    sides.push(dz > 0 ? "s" : "n");
  }
  return sides;
}
