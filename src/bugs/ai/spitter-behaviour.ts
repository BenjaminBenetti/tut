import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import { attack } from "../../tactical/model/attack-command";
import type { AttackCommand } from "../../tactical/model/attack-command";
import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import type { UnitWeapon } from "../../tactical/model/unit-weapon";
import { MELEE_RANGE } from "../../tactical/model/weapon-profile";
import { validateAttack } from "../../tactical/service/combat-service";
import { unitFootprintSize } from "../../tactical/service/footprint-service";
import { weaponSeesTile } from "../../tactical/service/mech-weapon-service";
import type { MoveGraph } from "../../tactical/service/movement-service";
import {
  apCostOf,
  buildMoveGraph,
} from "../../tactical/service/movement-service";
import {
  attackDistance,
  closestTiles,
  withinReach,
} from "../../tactical/service/weapon-reach-service";
import { SPITTER_TUNING } from "../data/spitter-tuning";
import type { SpitterTuning } from "../model/spitter-tuning";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import {
  advanceToward,
  attackOptions,
  bestBy,
  coverScore,
  exposureScore,
  huntableEnemies,
  huntSite,
  moveTowards,
  reachableTiles,
  recalledSite,
  targetValue,
  tileDistance,
} from "./utility";

// ===========================================
// Types
// ===========================================

/** One tile the spitter could end its move on, with what it costs. */
interface Candidate {
  readonly tile: TileCoord;
  /** Movement points spent reaching it; `0` for the tile it stands on. */
  readonly steps: number;
  /** Action points left on arrival, which decide whether it can still spit. */
  readonly apAfter: number;
}

/** A candidate tile scored, with the enemy it would spit at from there. */
interface Plan {
  readonly candidate: Candidate;
  readonly score: number;
  /** The enemy it would fire at from the tile; undefined when it has no shot there. */
  readonly target?: Unit;
}

// ===========================================
// Behaviour
// ===========================================

/**
 * The spitter (#1179, campaign arc §8): the first ranged bug, and the
 * first one cover protects against. It fights from a distance: each
 * turn it picks the tile it can reach that lets it spit at a TDF target
 * in reach and sight, from cover against that target's return fire,
 * seen by as few other enemies as it can manage — and never beside an
 * enemy while it can be anywhere else. Standing still is one of the
 * tiles, so a spitter already on a good tile stays and fires.
 *
 * ```
 *   enemy beside it at turn start?  ──yes──► the tile it holds is out:
 *        │                                  back off first
 *   tiles = reachable (+ where it stands), minus any beside an enemy
 *           (all of them, if every one is)
 *   tile  = argmax( shot?  shot·w + value·w + cover(target)·w − exposure(others)·w
 *                   else   −gap·w + cover(all)·w − exposure(all)·w )
 *           − steps·w
 *        │
 *        ├─ its own tile  ──► [attack]            (or [] with no shot)
 *        └─ another tile  ──► [move] ─ AP left and a shot ─► [move, attack]
 * ```
 *
 * The spit is the species' ordinary weapon, so the rules — reach, line
 * of sight, cover, hit chance — are the ones every rifle answers to;
 * the behaviour only chooses where to stand. It prices `weapons[0]`
 * alone, as `targetValue` and `attackOptions` do, which is right for a
 * species with one weapon.
 */
export class SpitterBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag = "snipe" as const;
  private readonly tuning: SpitterTuning;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param tuning - Scoring weights; the shipped set by default. */
  constructor(tuning: SpitterTuning = SPITTER_TUNING) {
    this.tuning = tuning;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** The spitter's commands for this turn. */
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
    const enemies = huntableEnemies(mission, unit);
    const graph = ctx.graph ?? buildMoveGraph(mission.map);
    if (enemies.length === 0) {
      return this.hunt(mission, unit, graph, ctx);
    }
    const weapon = mission.templates[unit.templateId]?.weapons[0];
    if (weapon === undefined) {
      return [];
    }
    const index = new TileIndex(mission.map);
    const plans = this.candidates(mission, unit, enemies, graph).map(
      (candidate) =>
        this.plan(mission, unit, weapon, enemies, candidate, index, ctx),
    );
    const best = bestBy(plans, (p) => p.score, ctx.rng);
    if (best === undefined) {
      return [];
    }
    if (best.candidate.steps === 0) {
      const shot = this.spit(mission, unit, best.target, ctx);
      return shot ? [shot] : [];
    }
    const step = moveTowards(mission, unitId, best.candidate.tile, graph);
    if (step === undefined) {
      return [];
    }
    const commands: TacticalCommand[] = [step];
    if (best.target !== undefined) {
      const moved: TacticalState = {
        ...mission,
        units: mission.units.map((u) =>
          u.id === unitId
            ? { ...u, pos: best.candidate.tile, ap: best.candidate.apAfter }
            : u,
        ),
      };
      const follow = this.spit(
        moved,
        { ...unit, pos: best.candidate.tile, ap: best.candidate.apAfter },
        best.target,
        ctx,
      );
      if (follow) {
        commands.push(follow);
      }
    }
    return commands;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * The tiles worth scoring: every reachable tile and the one it holds,
   * less any beside an enemy — unless that is all of them, when a
   * spitter boxed in fights from where it can. The tile it holds is out
   * when an enemy is already beside it, which is what makes it back off
   * before it fires rather than spit point-blank and stay.
   */
  private candidates(
    mission: TacticalState,
    unit: Unit,
    enemies: readonly Unit[],
    graph: MoveGraph,
  ): Candidate[] {
    const here: Candidate = { tile: unit.pos, steps: 0, apAfter: unit.ap };
    const moves: Candidate[] = reachableTiles(mission, unit.id, graph).map(
      (t) => ({
        tile: t.tile,
        steps: t.steps,
        apAfter: unit.ap - apCostOf(mission, unit, t.steps),
      }),
    );
    const clear = (c: Candidate): boolean => !besideAny(c.tile, enemies);
    const all = [here, ...moves];
    const open = all.filter(clear);
    // Boxed in: nowhere it can reach is clear of the enemy, so it holds
    // and spits rather than shuffle from one contact to another.
    return open.length > 0 ? open : [here];
  }

  /** Scores one candidate tile and names the enemy it would spit at from there. */
  private plan(
    mission: TacticalState,
    unit: Unit,
    weapon: UnitWeapon,
    enemies: readonly Unit[],
    candidate: Candidate,
    index: TileIndex,
    ctx: BehaviourContext,
  ): Plan {
    const t = this.tuning;
    const { tile } = candidate;
    const wander = candidate.steps * t.stepWeight;
    if (candidate.apAfter >= ctx.combat.attackApCost) {
      const shot = bestBy(
        enemies
          .filter((enemy) =>
            canSpitFrom(mission, unit, weapon, tile, enemy, index, ctx),
          )
          .map((enemy) => ({
            enemy,
            score: this.shotScore(mission, unit, tile, enemy, index, ctx),
          })),
        (s) => s.score,
        ctx.rng,
      );
      if (shot !== undefined) {
        const others = enemies.filter((e) => e.id !== shot.enemy.id);
        return {
          candidate,
          target: shot.enemy,
          score:
            t.shotWeight +
            shot.score -
            exposureScore(mission, tile, others, index) * t.exposureWeight -
            wander,
        };
      }
    }
    // No shot from here this turn: close the gap to the nearest reach,
    // from cover against every enemy it knows of.
    const gap = Math.min(
      ...enemies.map((enemy) =>
        Math.max(0, attackDistance(tile, enemy.pos) - weapon.profile.range),
      ),
    );
    return {
      candidate,
      score:
        -gap * t.approachWeight +
        coverScore(
          mission,
          tile,
          enemies.map((e) => e.pos),
          index,
        ) *
          t.coverWeight -
        exposureScore(mission, tile, enemies, index) * t.exposureWeight -
        wander,
    };
  }

  /**
   * What spitting at `enemy` from `tile` is worth: the shot's expected
   * value (`targetValue`) plus the cover the tile gives against that
   * enemy's return fire (`coverScore`).
   */
  private shotScore(
    mission: TacticalState,
    unit: Unit,
    tile: TileCoord,
    enemy: Unit,
    index: TileIndex,
    ctx: BehaviourContext,
  ): number {
    const t = this.tuning;
    const value = targetValue(
      mission,
      unit,
      tile,
      enemy,
      ctx.combat,
      index,
    ).value;
    const cover = coverScore(mission, tile, [enemy.pos], index);
    return value * t.valueWeight + cover * t.coverWeight;
  }

  /**
   * The attack from where `unit` stands: at the planned target when the
   * rules allow it, else at the best-valued enemy it can hit, else none.
   */
  private spit(
    mission: TacticalState,
    unit: Unit,
    target: Unit | undefined,
    ctx: BehaviourContext,
  ): AttackCommand | undefined {
    if (
      target !== undefined &&
      validateAttack(mission, unit.id, target.id, ctx.combat).ok
    ) {
      return attack(unit.id, target.id);
    }
    const option = attackOptions(mission, unit.id, ctx.combat)[0];
    return option ? attack(unit.id, option.target.id) : undefined;
  }

  /**
   * Nothing in view, so work toward where the swarm last saw an enemy,
   * else the generators or the landing site (#559, #716, #1175), as
   * every bug does. The spitter walks there by the shortest line: it
   * is looking for a target, and cover means nothing until it has one.
   */
  private hunt(
    mission: MissionView,
    unit: Unit,
    graph: MoveGraph,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const site = recalledSite(mission, unit) ?? huntSite(mission, unit.pos);
    if (site === undefined) {
      return [];
    }
    const t = this.tuning;
    const step = advanceToward(
      mission,
      unit.id,
      (tile) => -tileDistance(tile, site) * t.approachWeight,
      graph,
      ctx.rng,
    );
    return step ? [step] : [];
  }
}

// ===========================================
// Helpers
// ===========================================

/** True when some enemy stands within arm's reach of `tile` (#1179: where a spitter will not stay). */
export function besideAny(tile: TileCoord, enemies: readonly Unit[]): boolean {
  return enemies.some(
    (enemy) => attackDistance(tile, enemy.pos) <= MELEE_RANGE,
  );
}

/**
 * Whether `unit` could spit at `enemy` from `tile` by the rules' own
 * measures: the weapon's reach with height (`withinReach`) and its line
 * (`weaponSeesTile`), held against the enemy's nearest tile. The same
 * predicates `validateTargeting` asks, without building a hypothetical
 * mission per tile; the command is validated for real when it is sent.
 */
function canSpitFrom(
  mission: TacticalState,
  unit: Unit,
  weapon: UnitWeapon,
  tile: TileCoord,
  enemy: Unit,
  index: TileIndex,
  ctx: BehaviourContext,
): boolean {
  const { from, to } = closestTiles(
    tile,
    unitFootprintSize(mission, unit),
    enemy.pos,
    unitFootprintSize(mission, enemy),
  );
  return (
    withinReach(weapon.profile.range, from, to, ctx.combat) &&
    weaponSeesTile(mission, unit, weapon, from, to, index)
  );
}
