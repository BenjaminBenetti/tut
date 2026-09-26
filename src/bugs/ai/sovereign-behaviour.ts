import type { TileCoord } from "../../mapgen/model/tile-coord";
import { attack, attackTile } from "../../tactical/model/attack-command";
import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { validateTileAttack } from "../../tactical/service/combat-service";
import { unitFootprintSize } from "../../tactical/service/footprint-service";
import type { MoveGraph } from "../../tactical/service/movement-service";
import {
  apCostOf,
  buildMoveGraph,
  pathMovementCost,
} from "../../tactical/service/movement-service";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import type { SovereignTuning } from "../model/sovereign-tuning";
import { groundGap, isRetreating } from "../service/sovereign-service";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import { adjacentCount, breachTarget } from "./brute-behaviour";
import {
  advanceToward,
  attackOptions,
  bestBy,
  footprintDistance,
  huntSite,
  huntableEnemies,
  moveTowards,
  reachableTiles,
  recalledSite,
} from "./utility";

// ===========================================
// Types
// ===========================================

/** One tile she could end her move on. */
interface Candidate {
  readonly tile: TileCoord;
  /** Movement points spent reaching it; `0` for the tile she stands on. */
  readonly steps: number;
}

/** What scoring a tile needs to know about her and what she sees. */
interface Situation {
  readonly unit: Unit;
  readonly size: number;
  readonly enemies: readonly Unit[];
  /** The enemy she closes on while healthy; absent while retreating. */
  readonly focus?: Unit;
  /** Tiles from the core she is willing to stand. */
  readonly radius: number;
}

// ===========================================
// Behaviour
// ===========================================

/**
 * The Sovereign's deterministic fallback (#1179, campaign arc §9):
 * what she plays without Jev. Her aura, her guards and the marking of
 * her retreat are rules (`createSovereignAuraStep`,
 * `createGuardSummonStep`, `createSovereignRetreatStep`) that hold
 * whoever drives her; this is how she moves and fights.
 *
 * ```
 *   radius = retreating (marked, or hp ≤ 40 %) ? holdRadius : leashRadius
 *   enemies in view?
 *     ├─ yes ──► tile = argmax( − max(0, dist(core) − radius)·leash
 *     │                        + contact·w   (only if AP is left to strike)
 *     │                        − dist(focus)·w   (healthy only)
 *     │                        − steps·w )
 *     │            ├─ another tile ──► [move] then, AP left, strike or cut
 *     │            └─ her own      ──► strike, else cut, else hold
 *     └─ no  ──► outside radius of the core ──► walk back toward it
 *                inside it                  ──► hold
 *                no core (debug spawn)      ──► hunt the swarm's memory
 * ```
 *
 * **The core first.** She guards the core she was placed with
 * (`Unit.core`): a healthy Sovereign ranges `leashRadius` tiles from it
 * and no further, and closes on the visible enemy nearest the core —
 * the one that threatens it most — rather than the one nearest her.
 * Once hurt she falls back within `holdRadius` of it and holds, cutting
 * down whatever walks up to her. She never makes for the map edge.
 *
 * **Fair play.** Everything she scores is in the view, the faction's
 * shared vision (ADR 0006 §2.3): an enemy no bug has spotted is not in
 * `view.units`, so it draws nothing from her — no step toward it, no
 * strike at it.
 *
 * **The swarm is spent for the core** (arc §9). Her scythes sweep the
 * tiles beside the mark, and she swings whether or not her own guards
 * stand in the sweep. When she has nobody in reach but a wall between
 * her and her focus, she cuts it, as a brute does (`breachTarget`).
 */
export class SovereignBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag = "sovereign" as const;
  private readonly tuning: SovereignTuning;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param tuning - Her numbers and weights; the shipped set by default. */
  constructor(tuning: SovereignTuning = SOVEREIGN_TUNING) {
    this.tuning = tuning;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** Her commands for this turn: engage, fall back onto the core, or hold. */
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
    const graph = ctx.graph ?? buildMoveGraph(mission.map);
    const retreating = isRetreating(unit, this.tuning);
    const radius = retreating
      ? this.tuning.holdRadius
      : this.tuning.leashRadius;
    const enemies = huntableEnemies(mission, unit);
    if (enemies.length === 0) {
      return this.holdGround(mission, unit, radius, graph, ctx);
    }
    const size = unitFootprintSize(mission, unit);
    const situation: Situation = {
      unit,
      size,
      enemies,
      radius,
      ...(retreating ? {} : { focus: this.focusOf(mission, unit, enemies) }),
    };
    return this.engage(mission, situation, graph, ctx);
  }

  // ===========================================
  // Engaging
  // ===========================================

  /**
   * The tile she can reach that keeps her on her ground, puts her
   * scythes on the most visible enemies she still has the action points
   * to strike, and — healthy — closes on her focus, for the least
   * walking; then the strike. Her own tile is a candidate, so a
   * Sovereign already where she wants to be strikes without moving.
   */
  private engage(
    mission: MissionView,
    situation: Situation,
    graph: MoveGraph,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const { unit } = situation;
    const candidates: Candidate[] = [
      { tile: unit.pos, steps: 0 },
      ...reachableTiles(mission, unit.id, graph),
    ];
    const best = bestBy(
      candidates,
      (candidate) => this.tileScore(mission, candidate, situation),
      ctx.rng,
    );
    if (best === undefined || best.steps === 0) {
      return this.strike(mission, unit.id, situation, ctx);
    }
    const step = moveTowards(mission, unit.id, best.tile, graph);
    if (step === undefined) {
      return this.strike(mission, unit.id, situation, ctx);
    }
    const moved = afterMove(mission, unit, best.tile, step.payload.path);
    return [step, ...this.strike(moved, unit.id, situation, ctx)];
  }

  /** What one tile is worth to her (`SovereignTuning`). */
  private tileScore(
    mission: TacticalState,
    candidate: Candidate,
    situation: Situation,
  ): number {
    const t = this.tuning;
    const { unit, size, enemies, focus, radius } = situation;
    const leash =
      unit.core === undefined
        ? 0
        : Math.max(
            0,
            footprintDistance(candidate.tile, size, unit.core) - radius,
          );
    const canStrike = unit.ap - apCostOf(mission, unit, candidate.steps) >= 1;
    const contact = canStrike
      ? adjacentCount(candidate.tile, enemies, size)
      : 0;
    const closing =
      focus === undefined
        ? 0
        : groundGap(
            candidate.tile,
            size,
            focus.pos,
            unitFootprintSize(mission, focus),
          );
    return (
      -leash * t.leashWeight +
      contact * t.contactWeight -
      closing * t.focusWeight -
      candidate.steps * t.stepWeight
    );
  }

  /**
   * The enemy she closes on: the visible one nearest the core she
   * guards, ties to the one nearest her; with no core, the nearest to
   * her. Units order breaks what is left, so two runs agree.
   */
  private focusOf(
    mission: TacticalState,
    unit: Unit,
    enemies: readonly Unit[],
  ): Unit | undefined {
    const size = unitFootprintSize(mission, unit);
    let best: Unit | undefined;
    let bestKey: readonly [number, number] = [Infinity, Infinity];
    for (const enemy of enemies) {
      const enemySize = unitFootprintSize(mission, enemy);
      const toHer = groundGap(unit.pos, size, enemy.pos, enemySize);
      const toCore =
        unit.core === undefined
          ? toHer
          : groundGap(unit.core, 1, enemy.pos, enemySize);
      if (
        toCore < bestKey[0] ||
        (toCore === bestKey[0] && toHer < bestKey[1])
      ) {
        best = enemy;
        bestKey = [toCore, toHer];
      }
    }
    return best;
  }

  // ===========================================
  // Striking
  // ===========================================

  /**
   * Her scythes at the best enemy the rules let her hit from where she
   * stands; failing that — healthy, with a focus — a cut at the wall
   * between her and it; failing that, nothing.
   */
  private strike(
    mission: TacticalState,
    unitId: UnitId,
    situation: Situation,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const option = attackOptions(mission, unitId, ctx.combat)[0];
    if (option !== undefined) {
      return [attack(unitId, option.target.id)];
    }
    if (situation.focus === undefined) {
      return [];
    }
    const unit = mission.units.find((u) => u.id === unitId);
    if (unit === undefined) {
      return [];
    }
    const impact = breachTarget(
      mission,
      unit.pos,
      unitFootprintSize(mission, unit),
      situation.focus.pos,
    );
    if (impact === undefined) {
      return [];
    }
    return validateTileAttack(mission, unitId, impact, ctx.combat).ok
      ? [attackTile(unitId, impact)]
      : [];
  }

  // ===========================================
  // Holding
  // ===========================================

  /**
   * Nothing in view. Outside `radius` of her core she walks back toward
   * it; inside it she holds — the squad has to come to her. A Sovereign
   * placed with no core (the debug tool) hunts where the swarm last saw
   * an enemy, else the generators or the landing site.
   */
  private holdGround(
    mission: MissionView,
    unit: Unit,
    radius: number,
    graph: MoveGraph,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const size = unitFootprintSize(mission, unit);
    const t = this.tuning;
    const core = unit.core;
    if (core === undefined) {
      const site = recalledSite(mission, unit) ?? huntSite(mission, unit.pos);
      if (site === undefined) {
        return [];
      }
      const step = advanceToward(
        mission,
        unit.id,
        (tile) => -footprintDistance(tile, size, site),
        graph,
        ctx.rng,
      );
      return step ? [step] : [];
    }
    if (footprintDistance(unit.pos, size, core) <= radius) {
      return [];
    }
    const step = advanceToward(
      mission,
      unit.id,
      (tile) =>
        -Math.max(0, footprintDistance(tile, size, core) - radius) *
        t.leashWeight,
      graph,
      ctx.rng,
    );
    return step ? [step] : [];
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The mission as it will stand once she has walked `path` to `to`: her
 * anchor moved and the walk's action points spent, so the strike that
 * follows is planned against where she will be.
 */
function afterMove(
  mission: TacticalState,
  unit: Unit,
  to: TileCoord,
  path: readonly TileCoord[],
): TacticalState {
  const apAfter =
    unit.ap - apCostOf(mission, unit, pathMovementCost(mission, unit, path));
  return {
    ...mission,
    units: mission.units.map((u) =>
      u.id === unit.id ? { ...u, pos: to, ap: apAfter } : u,
    ),
  };
}
