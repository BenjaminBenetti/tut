import { manhattanDistance } from "../../core/service/grid-math";
import { allows } from "../../mapgen/model/pass-mask";
import type { UnitClass } from "../../mapgen/model/pass-mask";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { AttackCommand } from "../model/attack-command";
import { attack } from "../model/attack-command";
import type { AttackTarget } from "../model/attack-target";
import type { InteractCommand } from "../model/interact-command";
import { interact } from "../model/interact-command";
import type { MoveCommand } from "../model/move-command";
import { move } from "../model/move-command";
import type { ObjectiveTuning } from "../model/objective-tuning";
import type { ReloadCommand } from "../model/reload-command";
import { reload } from "../model/reload-command";
import type { TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { passMaskFor } from "../model/unit";
import { findAttackTarget } from "./attack-target-service";
import type { MoveGraph, TileKey } from "./movement-service";
import {
  buildMoveGraph,
  occupiedKeys,
  pathTo,
  searchMoves,
} from "./movement-service";
import { hasLineOfSight } from "./sight-service";

// ===========================================
// Types
// ===========================================

/**
 * Why a unit could not act against an objective this turn. The point of
 * naming them is that a run which fails to engage says which of these it
 * was, so the next report distinguishes a map problem from a driver one
 * (#494).
 *
 * | reason                | means                                             |
 * |-----------------------|---------------------------------------------------|
 * | `target-gone`         | already destroyed, or no such target              |
 * | `unit-unavailable`    | dead, not this side's phase, or out of actions     |
 * | `no-firing-position`  | no tile on the map can see it from inside range    |
 * | `no-route`            | firing positions exist but none can be walked to   |
 * | `out-of-charges`      | in position with an empty pool; reload first       |
 */
export type EngagementBlock =
  | "target-gone"
  | "unit-unavailable"
  | "no-firing-position"
  | "no-route"
  | "out-of-charges";

/** What the driver decided a unit should do next. */
export type DriverAction =
  | { readonly kind: "attack"; readonly command: AttackCommand }
  | { readonly kind: "interact"; readonly command: InteractCommand }
  | { readonly kind: "reload"; readonly command: ReloadCommand }
  | {
      readonly kind: "move";
      readonly command: MoveCommand;
      /** Where it is walking to this turn. */
      readonly to: TileCoord;
      /** Steps still between that tile and the nearest firing position. */
      readonly remaining: number;
    }
  | { readonly kind: "blocked"; readonly reason: EngagementBlock };

/**
 * How a unit is meant to get at an objective (#494): mechs shoot from a
 * firing position, infantry walks in and plants charges. A unit given the
 * charge plan falls back to firing when there is no route inside, which
 * is better than standing still and is reported as such.
 */
export type EngagementPlan = "fire" | "charges";

/** A tile a unit could shoot a target from. */
export interface FiringPosition {
  readonly tile: TileCoord;
  /** Manhattan tiles from there to the target. */
  readonly distance: number;
}

// ===========================================
// Firing positions
// ===========================================

/**
 * Every tile the unit's class could stand on and shoot `target` from:
 * inside its weapon's range, with the sight line clear. Unbounded by
 * movement, so it answers "can this ever be shot" rather than "can it be
 * shot this turn" — the distinction #494 turned on, because a mech has
 * no route onto an indoor spawner's tile and never needed one.
 *
 * ```
 *   tiles within weapon range of the target
 *     ├─ the class may occupy it            (pass mask)
 *     └─ hasLineOfSight(tile → target)      (sight-service)
 * ```
 */
export function firingPositions(
  mission: TacticalState,
  unit: Unit,
  target: AttackTarget,
  graph: MoveGraph = buildMoveGraph(mission.map),
): FiringPosition[] {
  const template = mission.templates[unit.templateId];
  if (template === undefined) {
    return [];
  }
  return positionsWithin(
    mission,
    unit,
    target,
    template.weapon.range,
    true,
    graph,
  );
}

/**
 * Every tile the unit's class could stand on within `range` of the
 * target, optionally needing the sight line clear. Firing wants sight;
 * planting charges only wants to be beside it, which is how infantry
 * gets at a spawner it cannot shoot.
 */
export function positionsWithin(
  mission: TacticalState,
  unit: Unit,
  target: AttackTarget,
  range: number,
  requireSight: boolean,
  graph: MoveGraph = buildMoveGraph(mission.map),
): FiringPosition[] {
  const unitClass = passMaskFor(unit.passClass);
  const found: FiringPosition[] = [];
  for (const tile of mission.map.tiles) {
    if (!occupiable(tile, unitClass)) {
      continue;
    }
    const distance = manhattanDistance(tile, target.pos);
    if (distance > range) {
      continue;
    }
    if (
      requireSight &&
      !hasLineOfSight(mission.map, tile, target.pos, graph.index)
    ) {
      continue;
    }
    found.push({ tile: { x: tile.x, y: tile.y, z: tile.z }, distance });
  }
  return found;
}

// ===========================================
// Driving
// ===========================================

/**
 * The one action that best advances `unitId` toward destroying `targetId`
 * (#494). Squads that can reach the objective tile plant charges on it;
 * everything else walks to a firing position and shoots.
 *
 * ```
 *   target gone / unit cannot act ──────────► blocked
 *   squad in charge range of its objective ─► interact
 *   in weapon range with sight ─┬─ charges ─► attack
 *                               └─ none ────► blocked out-of-charges
 *   otherwise: firing positions ─┬─ none ───► blocked no-firing-position
 *                                └─ walk down the field toward the nearest
 *                                   no progress possible ──► blocked no-route
 * ```
 *
 * The walk is a greedy descent on a whole-map cost field measured from
 * every firing position at once, so a unit closes on one across as many
 * turns as it takes rather than stalling when the goal is further than a
 * single turn's budget.
 */
export function nextActionAgainst(
  mission: TacticalState,
  unitId: UnitId,
  targetId: string,
  tuning: ObjectiveTuning,
  graph: MoveGraph = buildMoveGraph(mission.map),
  plan: EngagementPlan | undefined = undefined,
): DriverAction {
  const unit = mission.units.find((candidate) => candidate.id === unitId);
  const target = findAttackTarget(mission, targetId);
  if (target === undefined || target.hp <= 0) {
    return blocked("target-gone");
  }
  if (
    unit === undefined ||
    unit.hp <= 0 ||
    unit.ap <= 0 ||
    unit.team !== TEAM_FOR_PHASE[mission.phase]
  ) {
    return blocked("unit-unavailable");
  }
  const chosen = plan ?? defaultPlan(unit, target);

  if (chosen === "charges") {
    const charging = chargeAction(mission, unit, target, tuning, graph);
    if (charging !== undefined) {
      return charging;
    }
    // No way in. Shooting it is still better than standing there.
  }
  return fireAction(mission, unit, target, graph);
}

/**
 * Planting charges: interact from beside the spawner, else walk to a tile
 * beside it. `undefined` when this unit can never get there, so the
 * caller can fall back to fire.
 */
function chargeAction(
  mission: TacticalState,
  unit: Unit,
  target: AttackTarget,
  tuning: ObjectiveTuning,
  graph: MoveGraph,
): DriverAction | undefined {
  if (target.kind !== "spawner") {
    return undefined;
  }
  const objective = mission.objectives.find(
    (candidate) => candidate.targetId === target.id && !candidate.complete,
  );
  if (objective === undefined) {
    return undefined;
  }
  if (
    manhattanDistance(unit.pos, target.pos) <= tuning.interactRange &&
    unit.ap >= tuning.interactApCost
  ) {
    return { kind: "interact", command: interact(unit.id, objective.id) };
  }
  const beside = positionsWithin(
    mission,
    unit,
    target,
    tuning.interactRange,
    false,
    graph,
  );
  if (beside.length === 0) {
    return undefined;
  }
  const walk = walkToward(mission, unit, beside, graph);
  return walk.kind === "move" ? walk : undefined;
}

/**
 * Shooting: fire from here, reload an empty pool, else walk to a firing
 * position.
 */
function fireAction(
  mission: TacticalState,
  unit: Unit,
  target: AttackTarget,
  graph: MoveGraph,
): DriverAction {
  const template = mission.templates[unit.templateId];
  const range = template?.weapon.range ?? 0;
  const inRange =
    manhattanDistance(unit.pos, target.pos) <= range &&
    hasLineOfSight(mission.map, unit.pos, target.pos, graph.index);
  if (inRange) {
    if (unit.charges !== undefined && unit.charges <= 0) {
      // An empty pool is a turn spent reloading, not a dead end: the
      // stall #494 describes is a driver that stops here.
      return template?.charges === undefined
        ? blocked("out-of-charges")
        : { kind: "reload", command: reload(unit.id) };
    }
    return { kind: "attack", command: attack(unit.id, target.id) };
  }
  const positions = firingPositions(mission, unit, target, graph);
  if (positions.length === 0) {
    return blocked("no-firing-position");
  }
  return walkToward(mission, unit, positions, graph);
}

/** Mechs shoot; infantry carries the charges in, since only it gets indoors. */
function defaultPlan(unit: Unit, target: AttackTarget): EngagementPlan {
  return unit.kind === "mech" || target.kind !== "spawner" ? "fire" : "charges";
}

// ===========================================
// Private
// ===========================================

/**
 * Steps the unit as far down the cost field toward the nearest firing
 * position as this turn's budget allows. `no-route` when no tile it can
 * reach is closer to a firing position than the one it stands on.
 */
function walkToward(
  mission: TacticalState,
  unit: Unit,
  positions: readonly FiringPosition[],
  graph: MoveGraph,
): DriverAction {
  const unitClass = passMaskFor(unit.passClass);
  const field = costsFrom(
    graph,
    positions.map((position) => position.tile),
    unitClass,
  );
  const here = field.get(graph.index.keyOf(unit.pos));
  const search = searchMoves(mission, unit, graph);
  let bestKey: TileKey | undefined;
  let bestCost = here ?? Number.POSITIVE_INFINITY;
  let bestSteps = 0;
  for (const [key, tile] of search.tiles) {
    const cost = field.get(key);
    const steps = search.costs.get(key) ?? 0;
    if (cost === undefined || steps === 0) {
      continue;
    }
    if (cost < bestCost || (cost === bestCost && steps < bestSteps)) {
      bestKey = key;
      bestCost = cost;
      bestSteps = steps;
      void tile;
    }
  }
  if (bestKey === undefined) {
    return blocked("no-route");
  }
  const destination = search.tiles.get(bestKey);
  if (destination === undefined) {
    return blocked("no-route");
  }
  const to = { x: destination.x, y: destination.y, z: destination.z };
  const path = pathTo(mission, unit.id, to, graph);
  if (path === undefined || path.length === 0) {
    return blocked("no-route");
  }
  return {
    kind: "move",
    command: move(unit.id, path),
    to,
    remaining: bestCost,
  };
}

/**
 * Steps from every one of `origins` to every tile the class can walk,
 * as one multi-source breadth-first search. Unbounded and blind to units,
 * because it measures the map rather than one turn: transient blocking is
 * the bounded search's business.
 */
function costsFrom(
  graph: MoveGraph,
  origins: readonly TileCoord[],
  unitClass: UnitClass,
): Map<TileKey, number> {
  const costs = new Map<TileKey, number>();
  const frontier: Tile[] = [];
  for (const origin of origins) {
    const tile = graph.index.getAt(origin);
    if (tile === undefined || !occupiable(tile, unitClass)) {
      continue;
    }
    const key = graph.index.keyOf(tile);
    if (!costs.has(key)) {
      costs.set(key, 0);
      frontier.push(tile);
    }
  }
  // for-of sees elements pushed during iteration, so this is a BFS queue.
  for (const current of frontier) {
    const cost = (costs.get(graph.index.keyOf(current)) ?? 0) + 1;
    for (const next of graph.reachability.neighbours(current, unitClass)) {
      const key = graph.index.keyOf(next);
      if (costs.has(key)) {
        continue;
      }
      costs.set(key, cost);
      frontier.push(next);
    }
  }
  return costs;
}

/** Whether a class may stand on a tile. */
function occupiable(tile: Tile, unitClass: UnitClass): boolean {
  return allows(tile.pass, unitClass);
}

/** A blocked action with its reason. */
function blocked(reason: EngagementBlock): DriverAction {
  return { kind: "blocked", reason };
}

/** Tiles held by living units other than `unit`, for callers that need it. */
export function blockedTiles(
  mission: TacticalState,
  unit: Unit,
  graph: MoveGraph = buildMoveGraph(mission.map),
): ReadonlySet<TileKey> {
  return occupiedKeys(mission, graph.index, unit.id);
}
