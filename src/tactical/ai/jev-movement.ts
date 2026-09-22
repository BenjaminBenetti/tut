import type { TileCoord } from "../../mapgen/model/tile-coord";
import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { wallKindBlocks } from "../../mapgen/service/reachability-service";
import type { JevCandidate, JevMovement } from "../model/jev-control";
import type { TacticalState } from "../model/tactical-state";
import { passMaskFor, type Unit } from "../model/unit";
import { move } from "../model/move-command";
import {
  buildMoveGraph,
  searchMoves,
  moveBudget,
  type MoveGraph,
  type MoveSearch,
} from "../service/movement-service";
import {
  unitFootprintSize,
  footprintTiles,
} from "../service/footprint-service";

/** Public mission destination, without hidden terrain or target condition. */
export interface JevObjective {
  readonly id: string;
  readonly kind: string;
  readonly complete: boolean;
  readonly position?: TileCoord;
}

/** Objective locations are public intel; nest health and surrounding terrain are not. */
export function jevObjectives(mission: TacticalState): readonly JevObjective[] {
  return mission.objectives.map((objective) => ({
    id: objective.id,
    kind: objective.kind,
    complete: objective.complete,
    position: mission.spawners.find((nest) => nest.id === objective.targetId)
      ?.pos,
  }));
}

// ===========================================
// Movement intents
// ===========================================

/** Plan named destinations and directions with the game's weighted, occupied, faction-known graph. */
export function jevMovementCandidates(
  view: TacticalState,
  actor: Unit,
  objectives: readonly JevObjective[],
  names: Readonly<Record<string, string>>,
): readonly JevCandidate[] {
  if (actor.kind === "turret" || actor.ap <= 0 || actor.hp <= 0) return [];
  const budget = moveBudget(view, { ...actor, ap: 1 });
  if (budget <= 0) return [];
  const graph = buildMoveGraph(view.map);
  // One whole-known-map search serves all destinations; only a one-AP prefix is executable.
  const search = searchMoves(
    view,
    { ...actor, ap: Number.MAX_SAFE_INTEGER },
    graph,
  );
  const origin = graph.index.keyOf(actor.pos);
  const candidates: JevCandidate[] = [];
  /** Store legal prefixes locally while offering Jev only an intent and identity. */
  const add = (
    id: string,
    label: string,
    endpoint: number | undefined,
    intent: Omit<JevMovement, "stops">,
    fitsIntent: (pos: TileCoord) => boolean = () => true,
  ): void => {
    if (endpoint === undefined || endpoint === origin) return;
    const route = readRoute(search, origin, endpoint);
    const path = route.filter(
      (pos) => search.costs.get(graph.index.keyOf(pos))! <= budget,
    );
    const stops = path.flatMap((pos, index) =>
      fitsIntent(pos)
        ? [
            {
              steps: index + 1,
              cost: search.costs.get(graph.index.keyOf(pos))!,
            },
          ]
        : [],
    );
    const last = stops.at(-1);
    if (!last) return;
    candidates.push({
      id,
      category: "move",
      apCost: 1,
      description: label,
      command: move(actor.id, path.slice(0, last.steps)),
      movement: { ...intent, stops },
    });
  };
  const size = unitFootprintSize(view, actor);
  for (const target of view.units) {
    if (target.id === actor.id || target.hp <= 0) continue;
    const targetSize = unitFootprintSize(view, target);
    const approaches = approachKeys(
      graph,
      search,
      size,
      target.pos,
      targetSize,
      actor,
    );
    const knownEndpoint = cheapest(search, approaches);
    const endpoint =
      knownEndpoint ?? frontierToward(actor, target.pos, graph, search);
    // Already adjacent means no move; unreachable entities are not invented destinations.
    const name =
      names[target.id] ?? view.templates[target.templateId]?.name ?? target.id;
    const type =
      target.kind === "mech"
        ? "Mech"
        : (view.templates[target.templateId]?.name ?? target.kind);
    add(
      `move_to_entity:${target.id}`,
      `Move toward ${name} (${type}, ${target.team === actor.team ? "friendly" : "hostile"}).`,
      endpoint,
      {
        intent: "approach_entity",
        targetId: target.id,
        targetName: name,
        targetPosition: target.pos,
        routeKind:
          knownEndpoint === undefined ? "explore-frontier" : "known-route",
      },
    );
  }
  for (const objective of objectives) {
    if (objective.complete || !objective.position) continue;
    const key = graph.index.keyOf(objective.position);
    let endpoint = search.costs.has(key) ? key : undefined;
    // Nests can occupy impassable surfaces; stop at a reachable adjoining surface.
    if (endpoint === undefined && graph.index.getAt(objective.position))
      endpoint = cheapest(
        search,
        [...search.tiles.entries()]
          .filter(
            ([, tile]) =>
              footprintDistance(tile, size, objective.position!, 1) === 1,
          )
          .map(([id]) => id),
      );
    let routeKind: JevMovement["routeKind"] = "known-route";
    if (endpoint === undefined) {
      endpoint = frontierToward(actor, objective.position, graph, search);
      routeKind = "explore-frontier";
    }
    add(
      `move_to_objective:${objective.id}`,
      `Move toward ${objective.id} (${objective.kind}); arrival alone does not complete it.`,
      endpoint,
      {
        intent: "approach_objective",
        targetId: objective.id,
        targetName: objective.id,
        targetPosition: objective.position,
        routeKind,
      },
    );
  }
  const reachable = [...search.costs]
    .filter(([, cost]) => cost > 0 && cost <= budget)
    .map(([key]) => key);
  for (const [direction, dx, dz] of [
    ["north", 0, -1],
    ["east", 1, 0],
    ["south", 0, 1],
    ["west", -1, 0],
  ] as const) {
    /** Positive displacement along the map compass, independent of camera rotation. */
    const progress = (pos: TileCoord): number =>
      (pos.x - actor.pos.x) * dx + (pos.z - actor.pos.z) * dz;
    const endpoints = reachable.filter(
      (key) => progress(search.tiles.get(key)!) > 0,
    );
    endpoints.sort(
      (a, b) =>
        progress(search.tiles.get(b)!) - progress(search.tiles.get(a)!) ||
        search.costs.get(a)! - search.costs.get(b)! ||
        a - b,
    );
    add(
      `move_${direction}`,
      `Move ${direction} as far as possible within one AP.`,
      endpoints[0],
      {
        intent: `move_${direction}`,
        routeKind: "known-route",
      },
      (pos) => progress(pos) > 0,
    );
  }
  const hostiles = view.units.filter(
    (unit) => unit.team !== actor.team && unit.hp > 0,
  );
  if (hostiles.length) {
    /** Distance from the closest known hostile footprint; no hidden enemy influences retreat. */
    const separation = (pos: TileCoord): number =>
      Math.min(
        ...hostiles.map((enemy) =>
          footprintDistance(
            pos,
            size,
            enemy.pos,
            unitFootprintSize(view, enemy),
          ),
        ),
      );
    const initial = separation(actor.pos);
    const endpoints = reachable.filter(
      (key) => separation(search.tiles.get(key)!) > initial,
    );
    endpoints.sort(
      (a, b) =>
        separation(search.tiles.get(b)!) - separation(search.tiles.get(a)!) ||
        search.costs.get(a)! - search.costs.get(b)! ||
        a - b,
    );
    add(
      "move_away_from_enemies",
      "Move away from enemies: maximize distance from the nearest known hostile within one AP.",
      endpoints[0],
      {
        intent: "move_away_from_enemies",
        routeKind: "known-route",
      },
      (pos) => separation(pos) > initial,
    );
  }
  return candidates;
}

// ===========================================
// Known routes and exploration
// ===========================================

/** Pick a least-cost destination, breaking ties by tile key for deterministic replays. */
function cheapest(
  search: MoveSearch,
  keys: readonly number[],
): number | undefined {
  return [...keys].sort(
    (a, b) => search.costs.get(a)! - search.costs.get(b)! || a - b,
  )[0];
}

/** Recover a shortest route, excluding the actor's origin. */
function readRoute(
  search: MoveSearch,
  origin: number,
  endpoint: number,
): TileCoord[] {
  const path: TileCoord[] = [];
  for (let key = endpoint; key !== origin;) {
    const tile = search.tiles.get(key);
    const parent = search.parents.get(key);
    if (!tile || parent === undefined) return [];
    path.push({ x: tile.x, y: tile.y, z: tile.z });
    key = parent;
  }
  return path.reverse();
}

/** Require an open edge beside an entity, respecting both footprints and elevation links. */
function approachKeys(
  graph: MoveGraph,
  search: MoveSearch,
  size: number,
  target: TileCoord,
  targetSize: number,
  actor: Unit,
): readonly number[] {
  const keys = new Set<number>();
  for (const coord of footprintTiles(target, targetSize)) {
    const tile = graph.index.getAt(coord);
    if (!tile) continue;
    for (const neighbour of graph.reachability.neighbours(
      tile,
      passMaskFor(actor.passClass),
    ))
      for (let dx = 0; dx < size; dx++)
        for (let dz = 0; dz < size; dz++) {
          const anchor = {
            x: neighbour.x - dx,
            y: neighbour.y,
            z: neighbour.z - dz,
          };
          if (!graph.index.inBounds(anchor)) continue;
          const key = graph.index.keyOf(anchor);
          if (search.costs.has(key)) keys.add(key);
        }
  }
  return [...keys];
}

/** Manhattan distance between footprint edges, including level separation. */
function footprintDistance(
  a: TileCoord,
  aSize: number,
  b: TileCoord,
  bSize: number,
): number {
  return (
    Math.max(0, a.x - (b.x + bSize - 1), b.x - (a.x + aSize - 1)) +
    Math.max(0, a.z - (b.z + bSize - 1), b.z - (a.z + aSize - 1)) +
    Math.abs(a.y - b.y)
  );
}

/** Approach an unknown objective via a reachable knowledge boundary; never read unseen terrain. */
function frontierToward(
  actor: Unit,
  goal: TileCoord,
  graph: MoveGraph,
  search: MoveSearch,
): number | undefined {
  const frontiers = [...search.tiles.entries()].filter(([, tile]) =>
    DIRECTIONS.some((direction) => {
      const neighbour = stepGridPos(tile, direction);
      return (
        graph.index.inBounds(neighbour) &&
        !wallKindBlocks(tile.walls[direction], passMaskFor(actor.passClass)) &&
        [0, -1, 1].every(
          (dy) => !graph.index.get(neighbour.x, neighbour.y + dy, neighbour.z),
        )
      );
    }),
  );
  // Include the origin: an exhausted boundary should not cause a move away then straight back.
  frontiers.sort(
    ([a, posA], [b, posB]) =>
      search.costs.get(a)! +
        footprintDistance(posA, 1, goal, 1) -
        search.costs.get(b)! -
        footprintDistance(posB, 1, goal, 1) ||
      footprintDistance(posA, 1, goal, 1) -
        footprintDistance(posB, 1, goal, 1) ||
      a - b,
  );
  return frontiers[0]?.[0];
}
