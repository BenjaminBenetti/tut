import type { UnitClass } from "../../../mapgen/model/pass-mask";
import { allows } from "../../../mapgen/model/pass-mask";
import type { Tile } from "../../../mapgen/model/tile";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { MoveCommand } from "../../model/move-command";
import { move } from "../../model/move-command";
import type { TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { passMaskFor } from "../../model/unit";
import type { MoveGraph, MoveSearch, TileKey } from "../movement-service";
import { movePerAction, searchMoves } from "../movement-service";

// ===========================================
// Getting about (#1179)
// ===========================================
//
// Two questions every player asks: how far is every tile from where I
// want to be, and which tile can I reach this action. The first is a
// breadth-first field over the whole map from a set of goal tiles,
// blind to units (it measures the map, not this turn); the second is
// the rules' own bounded search, so a chosen tile is always one the
// Move handler accepts.
//
//   goals ──► distanceField (cached per map, class and goal set)
//         ──► fieldAround   (round the units standing now; uncached)
//         ──► fieldAvoiding (off the ground the caller names; uncached)
//   unit  ──► reachNow (searchMoves, capped at N actions of movement)
//             └── each tile: steps to get there, field distance after

/** A tile the unit can reach now, with what it costs and where it leaves the unit. */
export interface MoveOption {
  readonly tile: Tile;
  readonly key: TileKey;
  /** Movement points the walk costs. */
  readonly cost: number;
  /** Field distance to the nearest goal from there; Infinity when no goal is reachable. */
  readonly distance: number;
}

/** What a unit can reach now: the options and the search the path is read from. */
export interface Reach {
  readonly search: MoveSearch;
  readonly options: readonly MoveOption[];
  /** Field distance from where the unit stands now. */
  readonly here: number;
}

// ===========================================
// Distance fields
// ===========================================

/** Fields kept per graph before the oldest is dropped. */
const FIELD_CACHE_SIZE = 48;

/** Cached fields by graph, then by pass class and goal set. */
const FIELDS = new WeakMap<
  MoveGraph,
  Map<string, ReadonlyMap<TileKey, number>>
>();

/**
 * Steps from the nearest of `goals` to every tile a unit of `mask` can
 * walk, as one multi-source breadth-first search. Goals the class cannot
 * stand on still seed the search from their walkable neighbours, so a
 * spawner's footprint or a wall-bound civilian group can be a goal.
 */
export function distanceField(
  graph: MoveGraph,
  goals: readonly TileCoord[],
  mask: UnitClass,
): ReadonlyMap<TileKey, number> {
  const keys = goals
    .filter((goal) => graph.index.inBounds(goal))
    .map((goal) => graph.index.keyOf(goal))
    .sort((a, b) => a - b);
  const cacheKey = `${String(mask)}|${keys.join(",")}`;
  let cache = FIELDS.get(graph);
  if (cache === undefined) {
    cache = new Map();
    FIELDS.set(graph, cache);
  }
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const field = breadthFirst(graph, goals, mask);
  if (cache.size >= FIELD_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, field);
  return field;
}

/** The field for `unit`'s own pass class. */
export function fieldFor(
  graph: MoveGraph,
  unit: Unit,
  goals: readonly TileCoord[],
): ReadonlyMap<TileKey, number> {
  return distanceField(graph, goals, passMaskFor(unit.passClass));
}

/**
 * Steps from the nearest of `goals` to every tile a unit of `mask` can
 * walk without setting foot on a tile of `avoid`: the field for a walk
 * that keeps off ground the caller has reasons to keep off. Not cached;
 * the caller knows what its ground depends on.
 */
export function fieldAvoiding(
  graph: MoveGraph,
  goals: readonly TileCoord[],
  mask: UnitClass,
  avoid: ReadonlySet<TileKey>,
): ReadonlyMap<TileKey, number> {
  return breadthFirst(graph, goals, mask, avoid);
}

/**
 * Steps from the nearest of `goals` to every tile `unit` can walk,
 * going round the tiles every other living unit stands on: the field
 * for a walk the unit-blind one calls short when a body holds the
 * doorway. It holds for this moment only, so it is not cached.
 */
export function fieldAround(
  mission: TacticalState,
  graph: MoveGraph,
  unit: Unit,
  goals: readonly TileCoord[],
): ReadonlyMap<TileKey, number> {
  const blocked = new Set(
    mission.units
      .filter((other) => other.hp > 0 && other.id !== unit.id)
      .map((other) => graph.index.keyOf(other.pos)),
  );
  return breadthFirst(graph, goals, passMaskFor(unit.passClass), blocked);
}

// ===========================================
// Reach
// ===========================================

/**
 * Every tile `unit` can walk to spending at most `actions` actions on
 * movement, with its field distance to `field`'s goals. The unit's own
 * tile is not an option.
 */
export function reachNow(
  mission: TacticalState,
  unit: Unit,
  graph: MoveGraph,
  field: ReadonlyMap<TileKey, number>,
  actions: number,
): Reach {
  const search = searchMoves(mission, unit, graph);
  const budget = Math.max(0, actions) * movePerAction(mission, unit);
  const options: MoveOption[] = [];
  for (const [key, tile] of search.tiles) {
    const cost = search.costs.get(key) ?? 0;
    if (cost === 0 || cost > budget) {
      continue;
    }
    options.push({
      tile,
      key,
      cost,
      distance: field.get(key) ?? Number.POSITIVE_INFINITY,
    });
  }
  const here = field.get(graph.index.keyOf(unit.pos));
  return {
    search,
    options,
    here: here ?? Number.POSITIVE_INFINITY,
  };
}

/** The Move command that walks `unit` to `option` along the search's cheapest route. */
export function moveTo(
  unit: Unit,
  reach: Reach,
  option: MoveOption,
  graph: MoveGraph,
): MoveCommand | undefined {
  const origin = graph.index.keyOf(unit.pos);
  const path: TileCoord[] = [];
  let key: TileKey | undefined = option.key;
  while (key !== undefined && key !== origin) {
    const tile = reach.search.tiles.get(key);
    if (tile === undefined) {
      return undefined;
    }
    path.push({ x: tile.x, y: tile.y, z: tile.z });
    key = reach.search.parents.get(key);
  }
  if (key === undefined || path.length === 0) {
    return undefined;
  }
  return move(unit.id, path.reverse());
}

/**
 * The option that gets closest to the goals, cheapest walk first on a
 * tie: the plain "walk toward it" a player does without thinking.
 * Undefined when nothing reachable is closer than where it stands.
 */
export function closestStep(reach: Reach): MoveOption | undefined {
  let best: MoveOption | undefined;
  for (const option of reach.options) {
    if (option.distance >= reach.here) {
      continue;
    }
    if (
      best === undefined ||
      option.distance < best.distance ||
      (option.distance === best.distance && option.cost < best.cost)
    ) {
      best = option;
    }
  }
  return best;
}

// ===========================================
// Private
// ===========================================

/**
 * A multi-source breadth-first search over walkable tiles, never
 * entering a `blocked` one.
 */
function breadthFirst(
  graph: MoveGraph,
  goals: readonly TileCoord[],
  mask: UnitClass,
  blocked: ReadonlySet<TileKey> = new Set(),
): Map<TileKey, number> {
  const costs = new Map<TileKey, number>();
  const frontier: Tile[] = [];
  const seed = (tile: Tile, cost: number): void => {
    const key = graph.index.keyOf(tile);
    if (!costs.has(key) && !blocked.has(key)) {
      costs.set(key, cost);
      frontier.push(tile);
    }
  };
  for (const goal of goals) {
    const tile =
      graph.index.getAt(goal) ?? graph.index.column(goal.x, goal.z)[0];
    if (tile === undefined) {
      continue;
    }
    if (allows(tile.pass, mask)) {
      seed(tile, 0);
      continue;
    }
    // A goal nobody stands on (a spawner, a wreck): its walkable
    // neighbours are one step from it.
    for (const direction of ["n", "e", "s", "w"] as const) {
      const next = graph.index.neighbour(goal, direction);
      if (next !== undefined && allows(next.pass, mask)) {
        seed(next, 1);
      }
    }
  }
  // Seeds of cost 1 go after those of cost 0 only when both exist; a BFS
  // queue needs them ordered, so sort the seeds once.
  frontier.sort(
    (a, b) =>
      (costs.get(graph.index.keyOf(a)) ?? 0) -
      (costs.get(graph.index.keyOf(b)) ?? 0),
  );
  // for-of sees elements pushed during iteration, so this is a queue.
  for (const current of frontier) {
    const cost = (costs.get(graph.index.keyOf(current)) ?? 0) + 1;
    for (const next of graph.reachability.neighbours(current, mask)) {
      const key = graph.index.keyOf(next);
      if (costs.has(key) || blocked.has(key)) {
        continue;
      }
      costs.set(key, cost);
      frontier.push(next);
    }
  }
  return costs;
}
