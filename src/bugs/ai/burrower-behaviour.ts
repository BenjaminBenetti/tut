import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import { attack } from "../../tactical/model/attack-command";
import { burrow } from "../../tactical/model/burrow-command";
import type { BurrowTuning } from "../../tactical/model/burrow-tuning";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import type { MissionView } from "../../tactical/model/mission-view";
import { surface } from "../../tactical/model/surface-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { tunnel } from "../../tactical/model/tunnel-command";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { isBurrowed } from "../../tactical/model/unit";
import {
  burrowCooldownOver,
  canSurfaceOn,
  validateBurrow,
} from "../../tactical/service/burrow-service";
import { validateTargeting } from "../../tactical/service/combat-service";
import { unitFootprintTiles } from "../../tactical/service/footprint-service";
import type { MoveGraph } from "../../tactical/service/movement-service";
import {
  apCostOf,
  buildMoveGraph,
} from "../../tactical/service/movement-service";
import {
  groundTileAt,
  isDiggable,
  searchTunnel,
  tunnelDestinations,
  tunnelHeldKeys,
} from "../../tactical/service/tunnel-service";
import { BURROWER_TUNING } from "../data/burrower-tuning";
import type { BurrowerTuning } from "../model/burrower-tuning";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import {
  advanceToward,
  attackOptions,
  bestBy,
  exposureScore,
  huntableEnemies,
  huntSite,
  livingEnemies,
  moveTowards,
  nearestEnemy,
  overwatchScore,
  reachableTiles,
  recalledSite,
  targetValue,
  tileDistance,
} from "./utility";

// ===========================================
// Types
// ===========================================

/** A place to come up beside a target, priced, and what digging there costs this turn. */
interface Landing {
  readonly tile: TileCoord;
  readonly target: Unit;
  readonly score: number;
  /** Movement points to tunnel there this turn; undefined when out of this turn's reach. */
  readonly cost: number | undefined;
  /** True for the tile it is already under. */
  readonly here: boolean;
}

// ===========================================
// Behaviour
// ===========================================

/**
 * The burrower (#1179, campaign arc §8): a melee ambusher that travels
 * under the ground. It decides from what its side can see like every
 * bug (ADR 0006 §2.3): the squad it tunnels toward is one some bug has
 * spotted, and a squad nobody has seen draws it only to where the swarm
 * last saw one, or to the landing site.
 *
 * **Under the ground** it picks a *landing*: a free, standable ground
 * tile beside a target from which its bite would reach, priced by
 * `BurrowerTuning`. Then, in order:
 *
 * ```
 *   already under a landing, AP to come up and bite ──► [surface, attack]   the ambush
 *   under a landing, too few AP to bite too ─────────► []                  wait for next phase
 *   a landing it can reach and still come up ────────► [tunnel, surface]   bites next phase
 *   a landing it can reach at all ───────────────────► [tunnel]            lies in wait beside it
 *   no landing within reach ─────────────────────────► [tunnel] toward the best one
 *   nobody to hunt ──► tunnel toward where one was last seen or the
 *                      landing site; once there, come up and look
 * ```
 *
 * The timing is the fairness rule. A burrower that tunnels in from afar
 * comes up with nothing left to bite with, so the squad sees it rise and
 * gets a turn to answer; one that lay in wait beside a squad for a whole
 * turn earned its ambush, and comes up and bites at once. Either way a
 * watcher fires as it comes up (`Surface` runs the step reaction), so a
 * squad on overwatch always gets the first shot.
 *
 * **On the surface** it is melee: it bites what it can reach, else walks
 * to a tile it can bite from and bites, else — once its cooldown since
 * coming up has run — goes back down and tunnels toward a landing with
 * the action it has left, else walks at its nearest target.
 */
export class BurrowerBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag = "burrow" as const;
  private readonly rules: BurrowTuning;
  private readonly tuning: BurrowerTuning;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param rules - What coming up and going down cost, and the cooldown;
   *   the tactical rules' own tuning, passed in by the composition root.
   * @param tuning - Landing weights; the shipped set by default.
   */
  constructor(rules: BurrowTuning, tuning: BurrowerTuning = BURROWER_TUNING) {
    this.rules = rules;
    this.tuning = tuning;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** The burrower's commands for this turn: underground or on the surface. */
  choose(
    mission: MissionView,
    unitId: UnitId,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const unit = mission.units.find((u) => u.id === unitId);
    if (unit === undefined || unit.hp <= 0) {
      return [];
    }
    return isBurrowed(unit)
      ? this.underground(mission, unit, ctx)
      : this.onTheSurface(mission, unit, ctx);
  }

  // ===========================================
  // Private Methods: under the ground
  // ===========================================

  /** A burrowed burrower's turn: the table in the class comment. */
  private underground(
    mission: TacticalState,
    unit: Unit,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const index = new TileIndex(mission.map);
    const targets = huntableEnemies(mission, unit);
    if (targets.length === 0) {
      return this.digToSite(mission, unit, index, ctx);
    }
    const landings = this.landings(mission, unit, targets, index, ctx.combat);
    const surfaceCost = this.rules.surfaceApCost;

    const here = landings.filter((landing) => landing.here);
    const ambush = bestBy(here, (landing) => landing.score, ctx.rng);
    if (ambush !== undefined) {
      return unit.ap >= surfaceCost + 1
        ? [surface(unit.id), attack(unit.id, ambush.target.id)]
        : [];
    }

    const reachable = landings.filter(
      (landing) => !landing.here && landing.cost !== undefined,
    );
    const apFor = (landing: Landing): number =>
      apCostOf(mission, unit, landing.cost ?? 0);
    const upThisTurn = bestBy(
      reachable.filter((landing) => apFor(landing) + surfaceCost <= unit.ap),
      (landing) => landing.score,
      ctx.rng,
    );
    if (upThisTurn !== undefined) {
      return [tunnel(unit.id, upThisTurn.tile), surface(unit.id)];
    }
    const lieInWait = bestBy(reachable, (landing) => landing.score, ctx.rng);
    if (lieInWait !== undefined) {
      return [tunnel(unit.id, lieInWait.tile)];
    }

    const goal =
      bestBy(landings, (landing) => landing.score, ctx.rng)?.tile ??
      nearestEnemy(mission, unit)?.pos ??
      targets[0]?.pos;
    const step =
      goal === undefined
        ? undefined
        : this.tunnelToward(mission, unit, goal, index, ctx);
    return step === undefined ? [] : [step];
  }

  /**
   * Nobody in view: tunnel toward where the swarm last saw an enemy, or
   * the landing site, and once there come up to look around — a
   * burrower that sat under an empty field forever would leave the
   * squad nothing to find.
   */
  private digToSite(
    mission: TacticalState,
    unit: Unit,
    index: TileIndex,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const site = recalledSite(mission, unit) ?? huntSite(mission, unit.pos);
    if (site === undefined) {
      return [];
    }
    const step = this.tunnelToward(mission, unit, site, index, ctx);
    if (step !== undefined) {
      return [step];
    }
    const tile = index.getAt(unit.pos);
    return tile !== undefined &&
      unit.ap >= this.rules.surfaceApCost &&
      canSurfaceOn(mission, unit, tile, index)
      ? [surface(unit.id)]
      : [];
  }

  /**
   * Every landing beside `targets`: a diggable ground tile, 4-adjacent
   * to a tile of the target, that nobody holds, that a unit of its class
   * can stand on, and from which a surfaced burrower's bite would reach
   * (`validateTargeting`, which is range and sight). The tile it is
   * already under is its own tile rather than its column's ground, so a
   * burrower that hatched on a floor comes up where it is.
   */
  private landings(
    mission: TacticalState,
    unit: Unit,
    targets: readonly Unit[],
    index: TileIndex,
    combat: CombatTuning,
  ): Landing[] {
    const search = searchTunnel(mission, unit, index);
    const held = tunnelHeldKeys(mission, index, unit.id);
    const enemies = livingEnemies(mission, unit);
    const landings: Landing[] = [];
    for (const target of targets) {
      const seen = new Set<number>();
      for (const beside of unitFootprintTiles(mission, target)) {
        for (const direction of DIRECTIONS) {
          const at = stepGridPos(beside, direction);
          const landing = this.landingOn(unit, at, index);
          if (landing === undefined) {
            continue;
          }
          const key = index.keyOf(landing.tile);
          if (seen.has(key) || (held.has(key) && !landing.here)) {
            continue;
          }
          seen.add(key);
          if (!canSurfaceOn(mission, unit, landing.tile, index)) {
            continue;
          }
          const up = surfacedAt(mission, unit, landing.tile);
          if (!validateTargeting(up, unit.id, target.id, combat).ok) {
            continue;
          }
          const { x, y, z } = landing.tile;
          landings.push({
            tile: { x, y, z },
            target,
            here: landing.here,
            cost: landing.here ? 0 : search.costs.get(key),
            score: this.landingScore(
              up,
              unit,
              landing.tile,
              target,
              enemies,
              combat,
              index,
            ),
          });
        }
      }
    }
    return landings;
  }

  /**
   * The tile it would come up on in the column at `at`: its own tile
   * when that is the column it is under, else the column's diggable
   * ground tile, else nothing.
   */
  private landingOn(
    unit: Unit,
    at: TileCoord,
    index: TileIndex,
  ): { readonly tile: Tile; readonly here: boolean } | undefined {
    if (at.x === unit.pos.x && at.z === unit.pos.z) {
      const own = index.getAt(unit.pos);
      return own === undefined ? undefined : { tile: own, here: true };
    }
    const ground = groundTileAt(index, at.x, at.z);
    return ground === undefined || !isDiggable(ground)
      ? undefined
      : { tile: ground, here: false };
  }

  /** The landing's score: the formula in `BurrowerTuning`. */
  private landingScore(
    up: TacticalState,
    unit: Unit,
    tile: TileCoord,
    target: Unit,
    enemies: readonly Unit[],
    combat: CombatTuning,
    index: TileIndex,
  ): number {
    const t = this.tuning;
    const surfaced = up.units.find((u) => u.id === unit.id) ?? unit;
    const value = targetValue(up, surfaced, tile, target, combat, index).value;
    const others = enemies.filter((enemy) => enemy.id !== target.id);
    return (
      value * t.valueWeight -
      exposureScore(up, tile, others, index) * t.exposureWeight -
      overwatchScore(up, tile, enemies, index) * t.overwatchWeight -
      tileDistance(unit.pos, tile) * t.stepWeight
    );
  }

  /**
   * A tunnel to the reachable, unheld column that ends nearest `goal`,
   * the cheaper of equals first, or nothing when no column gets it any
   * closer than it is.
   */
  private tunnelToward(
    mission: TacticalState,
    unit: Unit,
    goal: TileCoord,
    index: TileIndex,
    ctx: BehaviourContext,
  ): TacticalCommand | undefined {
    const best = bestBy(
      tunnelDestinations(mission, unit, index),
      (destination) =>
        -tileDistance(destination.tile, goal) -
        destination.cost * this.tuning.stepWeight,
      ctx.rng,
    );
    if (
      best === undefined ||
      tileDistance(best.tile, goal) >= tileDistance(unit.pos, goal)
    ) {
      return undefined;
    }
    const { x, y, z } = best.tile;
    return tunnel(unit.id, { x, y, z });
  }

  // ===========================================
  // Private Methods: on the surface
  // ===========================================

  /** A surfaced burrower's turn: bite, walk and bite, dive, or close. */
  private onTheSurface(
    mission: TacticalState,
    unit: Unit,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const graph = ctx.graph ?? buildMoveGraph(mission.map);
    const targets = huntableEnemies(mission, unit);
    if (targets.length === 0) {
      const site = recalledSite(mission, unit) ?? huntSite(mission, unit.pos);
      const step =
        site === undefined
          ? undefined
          : advanceToward(
              mission,
              unit.id,
              (tile) => -tileDistance(tile, site),
              graph,
              ctx.rng,
            );
      return step === undefined ? [] : [step];
    }

    const standing = attackOptions(mission, unit.id, ctx.combat)[0];
    if (standing !== undefined) {
      return [attack(unit.id, standing.target.id)];
    }

    const walkAndBite = this.walkAndBite(mission, unit, targets, graph, ctx);
    if (walkAndBite.length > 0) {
      return walkAndBite;
    }

    if (
      burrowCooldownOver(unit, mission.turn, this.rules) &&
      validateBurrow(mission, unit.id, this.rules).ok
    ) {
      const down: Unit = {
        ...unit,
        status: [...unit.status, "burrowed"],
        ap: unit.ap - this.rules.burrowApCost,
      };
      const dived: TacticalState = {
        ...mission,
        units: mission.units.map((u) => (u.id === unit.id ? down : u)),
      };
      return [burrow(unit.id), ...this.underground(dived, down, ctx)];
    }

    const target = nearestEnemy(mission, unit) ?? targets[0];
    const step =
      target === undefined
        ? undefined
        : advanceToward(
            mission,
            unit.id,
            (tile) => -tileDistance(tile, target.pos),
            graph,
            ctx.rng,
          );
    return step === undefined ? [] : [step];
  }

  /**
   * A walk to the best tile it can bite from this turn with an action to
   * spare, and the bite; nothing when no such tile is in reach. Only
   * tiles beside a target are priced, since a bite reaches no further.
   */
  private walkAndBite(
    mission: TacticalState,
    unit: Unit,
    targets: readonly Unit[],
    graph: MoveGraph,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const bites: { tile: TileCoord; targetId: UnitId; score: number }[] = [];
    for (const reach of reachableTiles(mission, unit.id, graph)) {
      if (
        !targets.some((target) =>
          unitFootprintTiles(mission, target).some(
            (tile) => tileDistance(tile, reach.tile) <= 1,
          ),
        )
      ) {
        continue;
      }
      const apAfter = unit.ap - apCostOf(mission, unit, reach.steps);
      if (apAfter < 1) {
        continue;
      }
      const moved: TacticalState = {
        ...mission,
        units: mission.units.map((u) =>
          u.id === unit.id ? { ...u, pos: reach.tile, ap: apAfter } : u,
        ),
      };
      const option = attackOptions(moved, unit.id, ctx.combat)[0];
      if (option === undefined) {
        continue;
      }
      bites.push({
        tile: reach.tile,
        targetId: option.target.id,
        score:
          option.value * this.tuning.valueWeight -
          reach.steps * this.tuning.stepWeight,
      });
    }
    const best = bestBy(bites, (bite) => bite.score, ctx.rng);
    if (best === undefined) {
      return [];
    }
    const step = moveTowards(mission, unit.id, best.tile, graph);
    return step === undefined ? [] : [step, attack(unit.id, best.targetId)];
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The mission with the burrower surfaced on `tile`: what it would face
 * there, for pricing a landing and asking whether the bite would reach.
 */
function surfacedAt(
  mission: TacticalState,
  unit: Unit,
  tile: TileCoord,
): TacticalState {
  const up: Unit = {
    ...unit,
    pos: { x: tile.x, y: tile.y, z: tile.z },
    status: unit.status.filter((status) => status !== "burrowed"),
  };
  return {
    ...mission,
    units: mission.units.map((u) => (u.id === unit.id ? up : u)),
  };
}
