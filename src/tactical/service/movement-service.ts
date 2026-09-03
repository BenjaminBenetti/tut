import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { ReachabilityService } from "../../mapgen/service/reachability-service";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { passMaskFor } from "../model/unit";

// ===========================================
// Types
// ===========================================

/** A tile's integer key on its map, from `TileIndex.keyOf`. */
export type TileKey = number;

/**
 * The map's traversal structures, built once per map and shared by every
 * movement query on it: the AI asks for many units' reach per turn.
 */
export interface MoveGraph {
  readonly index: TileIndex;
  readonly reachability: ReachabilityService;
}

/**
 * The result of a bounded search from a unit's tile: the steps to every
 * tile it can reach, the tiles themselves, and the tile each one was
 * first reached from, so a path can be read back.
 */
export interface MoveSearch {
  /** Steps from the unit's own tile, which is present at `0`. */
  readonly costs: ReadonlyMap<TileKey, number>;
  readonly tiles: ReadonlyMap<TileKey, Tile>;
  /** Key of the tile each reached tile was entered from; absent for the origin. */
  readonly parents: ReadonlyMap<TileKey, TileKey>;
}

// ===========================================
// Constants
// ===========================================

/** Steps one tile of movement costs; connectors cost the same as a flat step. */
export const STEP_COST = 1;

// ===========================================
// Graph
// ===========================================

/** Indexes a map and its connectors for movement queries. */
export function buildMoveGraph(map: TacticalMap): MoveGraph {
  const index = new TileIndex(map);
  return {
    index,
    reachability: new ReachabilityService(index, map.connectors),
  };
}

// ===========================================
// Budget
// ===========================================

/**
 * Tiles a unit may still walk this turn: `ap × move` (GDD §6.2, one
 * action per `move` tiles, a dash for two). `0` for a unit that is down
 * or whose template is missing.
 */
export function moveBudget(mission: TacticalState, unit: Unit): number {
  if (unit.hp <= 0) {
    return 0;
  }
  return unit.ap * moveOf(mission, unit);
}

/**
 * Action points a walk of `steps` tiles costs: one per started block of
 * `move` tiles, so a dash is two. `0` for no steps.
 */
export function apCostOf(
  mission: TacticalState,
  unit: Unit,
  steps: number,
): number {
  if (steps <= 0) {
    return 0;
  }
  const move = moveOf(mission, unit);
  return move <= 0 ? Number.POSITIVE_INFINITY : Math.ceil(steps / move);
}

// ===========================================
// Queries
// ===========================================

/**
 * Every tile the unit can end a move on this turn, keyed by tile key with
 * the steps it takes; the unit's own tile is included at `0`. Empty for
 * an unknown unit. The traversal rule is mapgen's (ADR 0004 §5), so
 * infantry uses interiors, doors, stairs and ladders while mechs stay
 * outside and use ramps; living units of either team block their tiles.
 *
 * ```
 *   origin ──BFS, uniform STEP_COST, bounded by moveBudget──► { key → steps }
 *            neighbours: reachability.neighbours(tile, class) minus occupied
 * ```
 */
export function reachable(
  mission: TacticalState,
  unitId: UnitId,
  graph: MoveGraph = buildMoveGraph(mission.map),
): ReadonlyMap<TileKey, number> {
  const unit = findUnit(mission, unitId);
  if (unit === undefined) {
    return new Map();
  }
  return searchMoves(mission, unit, graph).costs;
}

/**
 * A shortest legal path for the unit to the target this turn, as the
 * tiles stepped through in order ending on the target (the origin is not
 * included), or `undefined` when the target is out of reach. The unit's
 * own tile gives `[]`. Deterministic: ties break in `DIRECTIONS` order,
 * then connectors.
 */
export function pathTo(
  mission: TacticalState,
  unitId: UnitId,
  target: TileCoord,
  graph: MoveGraph = buildMoveGraph(mission.map),
): TileCoord[] | undefined {
  const unit = findUnit(mission, unitId);
  if (unit === undefined || !graph.index.inBounds(target)) {
    return undefined;
  }
  const search = searchMoves(mission, unit, graph);
  const origin = graph.index.keyOf(unit.pos);
  let key = graph.index.keyOf(target);
  if (!search.costs.has(key)) {
    return undefined;
  }
  const path: TileCoord[] = [];
  while (key !== origin) {
    const tile = search.tiles.get(key);
    const parent = search.parents.get(key);
    if (tile === undefined || parent === undefined) {
      return undefined;
    }
    path.push({ x: tile.x, y: tile.y, z: tile.z });
    key = parent;
  }
  return path.reverse();
}

/**
 * Breadth-first search from the unit's tile under the §5 rule, uniform
 * `STEP_COST` per step, stopping at the unit's `moveBudget`. Tiles held
 * by other living units are never entered. A unit standing off the map
 * or on a tile its class may not occupy reaches nothing.
 */
export function searchMoves(
  mission: TacticalState,
  unit: Unit,
  graph: MoveGraph = buildMoveGraph(mission.map),
): MoveSearch {
  const costs = new Map<TileKey, number>();
  const tiles = new Map<TileKey, Tile>();
  const parents = new Map<TileKey, TileKey>();
  const origin = graph.index.getAt(unit.pos);
  if (origin === undefined) {
    return { costs, tiles, parents };
  }
  const budget = moveBudget(mission, unit);
  const unitClass = passMaskFor(unit.passClass);
  const blocked = occupiedKeys(mission, graph.index, unit.id);
  const originKey = graph.index.keyOf(origin);
  costs.set(originKey, 0);
  tiles.set(originKey, origin);
  // for-of sees elements pushed during iteration, so this is a BFS queue.
  const frontier: Tile[] = [origin];
  for (const current of frontier) {
    const currentKey = graph.index.keyOf(current);
    const cost = (costs.get(currentKey) ?? 0) + STEP_COST;
    if (cost > budget) {
      continue;
    }
    for (const next of graph.reachability.neighbours(current, unitClass)) {
      const key = graph.index.keyOf(next);
      if (costs.has(key) || blocked.has(key)) {
        continue;
      }
      costs.set(key, cost);
      tiles.set(key, next);
      parents.set(key, currentKey);
      frontier.push(next);
    }
  }
  return { costs, tiles, parents };
}

/**
 * Keys of the tiles held by living units, optionally leaving one unit
 * out (the mover). Units standing off the map hold nothing.
 */
export function occupiedKeys(
  mission: TacticalState,
  index: TileIndex,
  except?: UnitId,
): ReadonlySet<TileKey> {
  const keys = new Set<TileKey>();
  for (const other of mission.units) {
    if (other.hp <= 0 || other.id === except || !index.inBounds(other.pos)) {
      continue;
    }
    keys.add(index.keyOf(other.pos));
  }
  return keys;
}

// ===========================================
// Helpers
// ===========================================

/** The unit with the id, if it is in the mission. */
function findUnit(mission: TacticalState, unitId: UnitId): Unit | undefined {
  return mission.units.find((unit) => unit.id === unitId);
}

/** Tiles per move action from the unit's template; `0` when the template is missing. */
function moveOf(mission: TacticalState, unit: Unit): number {
  return mission.templates[unit.templateId]?.move ?? 0;
}
