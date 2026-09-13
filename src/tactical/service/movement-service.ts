import { allows } from "../../mapgen/model/pass-mask";
import type { UnitClass } from "../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { ReachabilityService } from "../../mapgen/service/reachability-service";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { passMaskFor } from "../model/unit";
import {
  footprintTiles,
  unitFootprintSize,
  unitFootprintTiles,
} from "./footprint-service";

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
// Footprints
// ===========================================

/**
 * True when a block of `size` tiles a side can stand anchored at
 * `anchor` (#1130): every tile of it exists on the anchor's level, the
 * class may occupy each, and the block holds together — no wall the
 * class cannot pass runs between two of its tiles, so a brute never
 * straddles a partition. One tile always fits where the class may stand.
 *
 * ```
 *   size 2 at A          every tile present and allowed, and
 *      A ─ 1             each drawn edge a legal step (§5 rule)
 *      │   │
 *      2 ─ 3
 * ```
 *
 * @param graph - The map's traversal structures.
 * @param anchor - The lowest-`x`, lowest-`z` tile of the block.
 * @param size - Tiles per side.
 * @param unitClass - The class that wants to stand there.
 * @returns Whether the whole block is standable.
 */
export function footprintFits(
  graph: MoveGraph,
  anchor: TileCoord,
  size: number,
  unitClass: UnitClass,
): boolean {
  const tiles: Tile[] = [];
  for (const coord of footprintTiles(anchor, size)) {
    const tile = graph.index.getAt(coord);
    if (tile === undefined || !allows(tile.pass, unitClass)) {
      return false;
    }
    tiles.push(tile);
  }
  const side = Math.max(1, Math.floor(size));
  for (let dz = 0; dz < side; dz++) {
    for (let dx = 0; dx < side; dx++) {
      const here = tiles[dz * side + dx]!;
      const east = tiles[dz * side + dx + 1];
      if (
        dx + 1 < side &&
        !graph.reachability.canStep(here, east!, unitClass)
      ) {
        return false;
      }
      const south = tiles[(dz + 1) * side + dx];
      if (
        dz + 1 < side &&
        !graph.reachability.canStep(here, south!, unitClass)
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * True when a unit of `size` tiles a side may move its anchor from
 * `from` to `to` under the §5 rule (#1130): the anchor's own step is
 * legal, every other tile of the block makes the same step legally in
 * parallel, and the block it lands on fits. For one tile this is
 * exactly `ReachabilityService.canStep`, so nothing single-tile changes.
 *
 * ```
 *   from ──► to        A→A'  1→1'  2→2'  3→3'   each a legal step
 *   A 1     A'1'       and footprintFits(to)
 *   2 3     2'3'
 * ```
 *
 * @param graph - The map's traversal structures.
 * @param from - The anchor tile the unit stands on.
 * @param to - The anchor tile it would step to.
 * @param size - Tiles per side.
 * @param unitClass - The unit's class.
 * @returns Whether the step is legal for the whole block.
 */
export function footprintCanStep(
  graph: MoveGraph,
  from: Tile,
  to: Tile,
  size: number,
  unitClass: UnitClass,
): boolean {
  if (!graph.reachability.canStep(from, to, unitClass)) {
    return false;
  }
  if (size <= 1) {
    return true;
  }
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  for (const origin of footprintTiles(from, size)) {
    if (origin.x === from.x && origin.z === from.z) {
      continue;
    }
    const here = graph.index.getAt(origin);
    const there = graph.index.get(origin.x + dx, to.y, origin.z + dz);
    if (
      here === undefined ||
      there === undefined ||
      !graph.reachability.canStep(here, there, unitClass)
    ) {
      return false;
    }
  }
  return footprintFits(graph, to, size, unitClass);
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
 *
 * A unit with a footprint (#1130) searches over anchors: a step is legal
 * only when its whole block makes it (`footprintCanStep`) and none of
 * the block's destination tiles is held by another unit. The costs are
 * still one per anchor step, so a brute's move is measured like anyone
 * else's.
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
  const size = unitFootprintSize(mission, unit);
  // Whether the block may land on `next`, stepping from `current`. One
  // tile is the rule as it always was: the neighbour is free.
  const enterable = (current: Tile, next: Tile): boolean =>
    size === 1
      ? !blocked.has(graph.index.keyOf(next))
      : footprintCanStep(graph, current, next, size, unitClass) &&
        footprintTiles(next, size).every(
          (tile) => !blocked.has(graph.index.keyOf(tile)),
        );
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
      if (costs.has(key) || !enterable(current, next)) {
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
 * Keys of the tiles held by living units — every tile of a unit's
 * footprint (#1130) — optionally leaving one unit out (the mover).
 * Tiles off the map are not held.
 */
export function occupiedKeys(
  mission: TacticalState,
  index: TileIndex,
  except?: UnitId,
): ReadonlySet<TileKey> {
  const keys = new Set<TileKey>();
  for (const other of mission.units) {
    if (other.hp <= 0 || other.id === except) {
      continue;
    }
    for (const tile of unitFootprintTiles(mission, other)) {
      if (index.inBounds(tile)) {
        keys.add(index.keyOf(tile));
      }
    }
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
