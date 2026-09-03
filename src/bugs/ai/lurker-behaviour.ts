import { oppositeDirection, stepGridPos } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { AttackCommand } from "../../tactical/model/attack-command";
import { attack } from "../../tactical/model/attack-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import {
  attackTerrain,
  validateAttack,
} from "../../tactical/service/combat-service";
import {
  apCostOf,
  buildMoveGraph,
} from "../../tactical/service/movement-service";
import { LURKER_TUNING } from "../data/lurker-tuning";
import type { LurkerTuning } from "../model/lurker-tuning";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import {
  attackOptions,
  bestBy,
  clumpScore,
  distanceScore,
  exposureScore,
  livingEnemies,
  moveTowards,
  reachableTiles,
  targetValue,
  tileDistance,
} from "./utility";

// ===========================================
// Behaviour
// ===========================================

/**
 * The lurker (GDD §6.4): a stealthy flanker. It picks the most isolated
 * enemy as its mark, and each turn either strikes when it already
 * flanks the mark, or moves to the reachable tile that best combines
 * flanking the mark, standing directly behind its facing, staying out
 * of every enemy's sight, and closing distance, then strikes from there
 * if it still has the action points and the terrain flanks. A lurker
 * beside its mark's front with no flank available circles rather than
 * attacking into cover.
 *
 * ```
 *   mark = most isolated enemy
 *   flanking now?  ──yes──► [attack]
 *        │no
 *   tile = argmax( flank·w + behind·w + adjacent·w − exposure·w + approach·w − levels·w )
 *        │
 *        ├─ tile flanks and AP left ──► [move, attack]
 *        └─ else                     ──► [move]
 * ```
 */
export class LurkerBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag = "flank" as const;
  private readonly tuning: LurkerTuning;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param tuning - Scoring weights; the shipped set by default. */
  constructor(tuning: LurkerTuning = LURKER_TUNING) {
    this.tuning = tuning;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** The lurker's commands for this turn. */
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
    const index = new TileIndex(mission.map);
    const mark = this.pickMark(mission, unit, enemies, ctx);

    // Strike from where it stands only when the terrain flanks the mark.
    const standing = this.flankingShot(mission, unit, mark, ctx);
    if (standing) {
      return [standing];
    }

    const graph = ctx.graph ?? buildMoveGraph(mission.map);
    const tiles = reachableTiles(mission, unitId, graph);
    const behind = tileBehind(mark);
    const others = enemies.filter((e) => e.id !== mark.id);
    const best = bestBy(
      tiles,
      (t) => this.scoreTile(mission, t.tile, mark, others, behind, index),
      ctx.rng,
    );
    if (best === undefined) {
      return [];
    }
    const step = moveTowards(mission, unitId, best.tile, graph);
    if (step === undefined) {
      return [];
    }
    const commands: TacticalCommand[] = [step];

    // After the move: attack if action points remain and the new tile flanks.
    const apAfter = unit.ap - apCostOf(mission, unit, step.payload.path.length);
    const moved: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === unitId ? { ...u, pos: best.tile, ap: apAfter } : u,
      ),
    };
    const follow = this.flankingShot(
      moved,
      { ...unit, pos: best.tile, ap: apAfter },
      mark,
      ctx,
    );
    if (follow) {
      commands.push(follow);
    }
    return commands;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** The most isolated enemy, ties broken by how valuable a hit on it would be. */
  private pickMark(
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
          this.tuning.isolationRadius,
        );
        const value = targetValue(
          mission,
          unit,
          unit.pos,
          enemy,
          ctx.combat,
          index,
        ).value;
        return -company * this.tuning.isolationWeight + value * 0.5;
      },
      ctx.rng,
    );
    return chosen ?? enemies[0]!;
  }

  /** An attack on the mark from the unit's current tile, when valid and flanking. */
  private flankingShot(
    mission: TacticalState,
    unit: Unit,
    mark: Unit,
    ctx: BehaviourContext,
  ): AttackCommand | undefined {
    const checked = validateAttack(mission, unit.id, mark.id, ctx.combat);
    if (!checked.ok) {
      return undefined;
    }
    if (checked.value.terrain.flanked || !markHasAnyCover(mission, mark)) {
      return attack(unit.id, mark.id);
    }
    // Any other enemy already flanked is fair game too.
    const option = attackOptions(mission, unit.id, ctx.combat).find(
      (o) =>
        attackTerrain(mission.map, unit.pos, o.target.pos).flanked ||
        !markHasAnyCover(mission, o.target),
    );
    return option ? attack(unit.id, option.target.id) : undefined;
  }

  /** The lurker's utility for standing on `tile` this turn; `others` are the enemies besides the mark. */
  private scoreTile(
    mission: TacticalState,
    tile: TileCoord,
    mark: Unit,
    others: readonly Unit[],
    behind: TileCoord,
    index: TileIndex,
  ): number {
    const t = this.tuning;
    const terrain = attackTerrain(mission.map, tile, mark.pos, index);
    const flank = terrain.flanked ? 1 : 0;
    const isBehind =
      tile.x === behind.x && tile.z === behind.z && tile.y === behind.y ? 1 : 0;
    const adjacent =
      tileDistance(tile, mark.pos) === 1 && tile.y === mark.pos.y ? 1 : 0;
    const exposure = exposureScore(mission, tile, others, index);
    const approach = distanceScore(tile, mark.pos, t.approachHorizon);
    const levels = Math.abs(tile.y - mark.pos.y);
    return (
      flank * t.flankWeight +
      isBehind * t.behindWeight +
      adjacent * t.adjacentWeight -
      exposure * t.exposureWeight +
      approach * t.approachWeight -
      levels * t.levelWeight
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/** The tile directly behind a unit: one step opposite its facing, same level. */
export function tileBehind(unit: Unit): TileCoord {
  return stepGridPos(unit.pos, oppositeDirection(unit.facing));
}

/** True when the unit has cover from at least one direction, so a flank exists. */
function markHasAnyCover(mission: TacticalState, unit: Unit): boolean {
  const index = new TileIndex(mission.map);
  return [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ].some(
    (d) =>
      attackTerrain(
        mission.map,
        { x: unit.pos.x + d.x, y: unit.pos.y, z: unit.pos.z + d.z },
        unit.pos,
        index,
      ).cover > 0,
  );
}
