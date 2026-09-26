import type { TileCoord } from "../../mapgen/model/tile-coord";
import { attack } from "../../tactical/model/attack-command";
import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import type { WeaponReachTuning } from "../../tactical/model/weapon-reach-tuning";
import { unitFootprintSize } from "../../tactical/service/footprint-service";
import { touchesMapEdge } from "../../tactical/service/map-edge-service";
import type {
  MoveGraph,
  TileKey,
} from "../../tactical/service/movement-service";
import {
  buildMoveGraph,
  moveBudget,
  searchMoves,
} from "../../tactical/service/movement-service";
import {
  attackDistance,
  closestTiles,
  weaponReach,
} from "../../tactical/service/weapon-reach-service";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import type { BroodmotherTuning } from "../model/broodmother-tuning";
import { isFleeing } from "../service/broodmother-service";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import {
  advanceToward,
  attackOptions,
  bestBy,
  footprintDistance,
  huntSite,
  livingEnemies,
  moveTowards,
  reachableTiles,
  recalledSite,
} from "./utility";

// ===========================================
// Constants
// ===========================================

/**
 * Action points lent to the flight search so it is bounded by the map
 * rather than by this turn's budget: enough to cross any map the
 * generator makes many times over, so the nearest edge is found however
 * far away it is. The move itself is still held to the real budget.
 */
const FLIGHT_SEARCH_AP = 10_000;

// ===========================================
// Types
// ===========================================

/** One tile she could end her move on. */
interface Candidate {
  readonly tile: TileCoord;
  /** Movement points spent reaching it; `0` for the tile she stands on. */
  readonly steps: number;
}

/** A visible enemy that can hurt her, and how far its guns reach. */
interface Threat {
  readonly enemy: Unit;
  readonly size: number;
  /** The longest range of its damaging weapons, before height. */
  readonly range: number;
}

// ===========================================
// Behaviour
// ===========================================

/**
 * The Broodmother's deterministic fallback (#1179, campaign arc §6.8
 * and §9): what she plays without Jev. She is not a fighter. Her
 * clutches do the fighting — a rule lays one beside her every three
 * turns (`createClutchStep`) — and she keeps herself out of the
 * squad's guns while they hatch; at half health she runs for the
 * nearest map edge, and a rule takes her off the map when she reaches
 * it (`createBroodmotherFlightStep`).
 *
 * ```
 *   fleeing (marked, or hp ≤ half)?
 *     └─ yes ──► nearest edge anchor by path cost, over the whole map
 *                  ├─ found   ──► walk the path as far as her budget goes
 *                  └─ none    ──► hold; bite whoever is beside her
 *   armed enemies in view?
 *     ├─ yes ──► tile = argmax( −threats·w + min(margin, cap)·w − steps·w )
 *     │            ├─ another tile ──► [move]
 *     │            └─ her own      ──► bite whoever is beside her, or hold
 *     └─ no  ──► keep standOff tiles from where the swarm last saw one
 * ```
 *
 * A threat is an enemy **in the view**, the faction's shared vision
 * (ADR 0006 §2.3): a squad no bug has spotted is not in `view.units`,
 * so she cannot keep away from it — she walks as though it were not
 * there, which is the fairness the arc asks of every named enemy.
 * Reach is the enemy's longest damaging weapon with its height bonus
 * (`weaponReach`), measured between the nearest tiles of her block and
 * its own; line of sight is not asked, so a wall between them does not
 * make a tile safe.
 */
export class BroodmotherBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag = "broodmother" as const;
  private readonly tuning: BroodmotherTuning;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param tuning - Her numbers and weights; the shipped set by default. */
  constructor(tuning: BroodmotherTuning = BROODMOTHER_TUNING) {
    this.tuning = tuning;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** Her commands for this turn: flee, keep her distance, or shadow the squad. */
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
    if (isFleeing(unit, this.tuning)) {
      return this.flee(mission, unit, graph, ctx);
    }
    const threats = threatsTo(mission, unit);
    if (threats.length === 0) {
      return this.shadow(mission, unit, graph, ctx);
    }
    return this.keepDistance(mission, unit, threats, graph, ctx);
  }

  // ===========================================
  // Keeping her distance
  // ===========================================

  /**
   * The tile she can reach that the fewest visible guns cover, with the
   * most clearance beyond the nearest one's reach up to `marginCap`,
   * for the least walking. Her own tile is a candidate, so a Broodmother
   * already out of reach stays where she is.
   */
  private keepDistance(
    mission: MissionView,
    unit: Unit,
    threats: readonly Threat[],
    graph: MoveGraph,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const size = unitFootprintSize(mission, unit);
    const candidates: Candidate[] = [
      { tile: unit.pos, steps: 0 },
      ...reachableTiles(mission, unit.id, graph),
    ];
    const best = bestBy(
      candidates,
      (candidate) => this.distanceScore(candidate, size, threats, ctx.combat),
      ctx.rng,
    );
    if (best === undefined || best.steps === 0) {
      return this.bite(mission, unit, ctx);
    }
    const step = moveTowards(mission, unit.id, best.tile, graph);
    return step === undefined ? this.bite(mission, unit, ctx) : [step];
  }

  /** What one tile is worth to a Broodmother keeping out of reach (`BroodmotherTuning`). */
  private distanceScore(
    candidate: Candidate,
    size: number,
    threats: readonly Threat[],
    combat: WeaponReachTuning,
  ): number {
    const t = this.tuning;
    let covered = 0;
    let margin = Number.POSITIVE_INFINITY;
    for (const threat of threats) {
      const clearance = clearanceFrom(candidate.tile, size, threat, combat);
      if (clearance <= 0) {
        covered += 1;
      }
      margin = Math.min(margin, clearance);
    }
    return (
      -covered * t.threatWeight +
      Math.min(margin, t.marginCap) * t.marginWeight -
      candidate.steps * t.stepWeight
    );
  }

  // ===========================================
  // Fleeing
  // ===========================================

  /**
   * Runs for the nearest map edge (arc §6.8): the edge anchor with the
   * cheapest path over the whole map, walked as far as this turn's
   * budget allows. On the edge already, she holds — the flight step
   * takes her off the map as the next phase opens. With no edge she can
   * reach, she holds and bites whoever has cornered her.
   */
  private flee(
    mission: MissionView,
    unit: Unit,
    graph: MoveGraph,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const size = unitFootprintSize(mission, unit);
    if (touchesMapEdge(mission.map, unit.pos, size)) {
      return [];
    }
    const search = searchMoves(
      mission,
      { ...unit, ap: FLIGHT_SEARCH_AP },
      graph,
    );
    const exits: { key: TileKey; cost: number }[] = [];
    for (const [key, tile] of search.tiles) {
      if (touchesMapEdge(mission.map, tile, size)) {
        exits.push({ key, cost: search.costs.get(key) ?? 0 });
      }
    }
    const exit = bestBy(exits, (e) => -e.cost, ctx.rng);
    if (exit === undefined) {
      return this.bite(mission, unit, ctx);
    }
    // Back along the path from the edge to the furthest tile this turn's
    // budget reaches: costs only fall toward the origin, so the first
    // tile within budget is the furthest.
    const budget = moveBudget(mission, unit);
    const origin = graph.index.keyOf(unit.pos);
    let key = exit.key;
    while (key !== origin && (search.costs.get(key) ?? 0) > budget) {
      const parent = search.parents.get(key);
      if (parent === undefined) {
        return [];
      }
      key = parent;
    }
    const tile = search.tiles.get(key);
    if (key === origin || tile === undefined) {
      return this.bite(mission, unit, ctx);
    }
    const step = moveTowards(
      mission,
      unit.id,
      { x: tile.x, y: tile.y, z: tile.z },
      graph,
    );
    return step === undefined ? this.bite(mission, unit, ctx) : [step];
  }

  // ===========================================
  // Shadowing
  // ===========================================

  /**
   * Nothing that can hurt her in view: she keeps `standOff` tiles from
   * where the swarm last saw an enemy, else from the generators or the
   * landing site (#559, #716, #1175), closing from further out and
   * backing off from nearer in, so her clutches land where the squad
   * will be without her walking into its guns.
   */
  private shadow(
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
    const size = unitFootprintSize(mission, unit);
    const step = advanceToward(
      mission,
      unit.id,
      (tile) =>
        -Math.abs(footprintDistance(tile, size, site) - t.standOff) *
        t.approachWeight,
      graph,
      ctx.rng,
    );
    return step ? [step] : [];
  }

  // ===========================================
  // Biting
  // ===========================================

  /**
   * Her weak bite at the best enemy the rules let her hit from where she
   * stands — only ever someone beside her, since it is melee — or
   * nothing. She bites only when she is holding her tile: cornered,
   * or out of reach of everything but whoever walked up to her.
   */
  private bite(
    mission: TacticalState,
    unit: Unit,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const option = attackOptions(mission, unit.id, ctx.combat)[0];
    return option === undefined ? [] : [attack(unit.id, option.target.id)];
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The enemies in the view that can hurt her: living, with at least one
 * weapon that does damage. A generator is an enemy with no gun, so it
 * is not a threat.
 */
function threatsTo(mission: TacticalState, unit: Unit): Threat[] {
  const threats: Threat[] = [];
  for (const enemy of livingEnemies(mission, unit)) {
    const weapons = mission.templates[enemy.templateId]?.weapons ?? [];
    let range = 0;
    for (const weapon of weapons) {
      if (weapon.profile.damage > 0) {
        range = Math.max(range, weapon.profile.range);
      }
    }
    if (range > 0) {
      threats.push({ enemy, size: unitFootprintSize(mission, enemy), range });
    }
  }
  return threats;
}

/**
 * Tiles between her block anchored at `tile` and the edge of `threat`'s
 * reach: positive when she is out of reach by that many, `0` or less
 * when its guns cover her. Measured from its nearest tile to hers, with
 * the height bonus a shooter above her earns (`weaponReach`).
 */
function clearanceFrom(
  tile: TileCoord,
  size: number,
  threat: Threat,
  combat: WeaponReachTuning,
): number {
  const { from, to } = closestTiles(threat.enemy.pos, threat.size, tile, size);
  return attackDistance(from, to) - weaponReach(threat.range, from, to, combat);
}
