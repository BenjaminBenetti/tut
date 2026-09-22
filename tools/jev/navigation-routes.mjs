import assert from "node:assert/strict";
import { jevPerception } from "../../src/tactical/ai/jev-observation.ts";
import {
  buildMoveGraph,
  searchMoves,
} from "../../src/tactical/service/movement-service.ts";
import { passMaskFor } from "../../src/tactical/model/unit.ts";
import { DIRECTIONS } from "../../src/core/model/direction.ts";
import {
  manhattanDistance,
  stepGridPos,
  gridPosEquals,
  oppositeDirection,
} from "../../src/core/service/grid-math.ts";
import { wallKindBlocks } from "../../src/mapgen/service/reachability-service.ts";

/** Experimental engine-assisted control: Jev chooses a public objective; code routes one AP, optionally probing a known door. */
export function goalRoutePage(
  snapshot,
  candidates,
  context,
  exploreDoors = false,
) {
  const observed = jevPerception(context.mission, context.mission.units[0]);
  const { view, probes } = exploreDoors
    ? doorHypotheses(observed, context.rejectedDoors)
    : { view: observed, probes: new Set() };
  const graph = buildMoveGraph(view.map);
  const actor = view.units[0];
  const search = searchMoves(
    view,
    { ...actor, ap: view.map.tiles.length },
    graph,
  );
  const actions = {};
  const plans = {};
  const criteria = {};
  for (const objective of snapshot.state.objectives) {
    if (!objective.position || objective.complete) continue;
    const memory = (context.navigationMemory[objective.id] ??= {
      exhausted: new Set(),
    });
    const plan = knownRoute(
      view,
      actor,
      objective.position,
      graph,
      search,
      memory,
      exploreDoors ? { probes, observed } : undefined,
    );
    if (!plan) continue;
    // An inferred door crossing is an attempt, not observed terrain. Stop at the first unknown cell.
    const probeIndex = plan.path.findIndex((pos) =>
      probes.has(graph.index.keyOf(pos)),
    );
    const safePrefix =
      probeIndex < 0 ? plan.path : plan.path.slice(0, probeIndex + 1);
    const endpoint = [...safePrefix]
      .reverse()
      .find(
        (pos) =>
          search.costs.get(graph.index.keyOf(pos)) <=
          snapshot.state.actor.movement,
      );
    let candidate = candidates.find((candidate) =>
      gridPosEquals(candidate.command.payload.path.at(-1), endpoint),
    );
    if (!candidate && probes.has(graph.index.keyOf(endpoint))) {
      const path = safePrefix.slice(
        0,
        safePrefix.findIndex((pos) => gridPosEquals(pos, endpoint)) + 1,
      );
      candidate = {
        id: `probe-door-${endpoint.x}-${endpoint.y}-${endpoint.z}`,
        category: "move",
        apCost: 1,
        description:
          "Attempt one step through an observed door; its hidden destination is unverified.",
        command: { type: "tactical:move", payload: { unitId: actor.id, path } },
      };
      plan.attemptedUnknownDoor = endpoint;
    }
    assert(candidate, "Engine waypoint must be an existing legal one-AP move");
    actions[objective.id] = candidate;
    plans[objective.id] = plan;
    criteria[objective.id] = `Move toward ${objective.id}.`;
  }
  assert(
    Object.keys(criteria).length,
    "No known route or unexplored reachable frontier remains",
  );
  return {
    stage: "movement-goal",
    actions,
    plans,
    request: {
      model: "jev-1.13.0",
      state: {
        entity_prompt: snapshot.state.entity_prompt,
        commander_prompt: snapshot.state.commander_prompt,
      },
      questions: {
        action: {
          type: "choice",
          instructions:
            "Which destination should this actor move toward to follow its orders? The game handles pathfinding around obstacles using faction knowledge, exploring when needed. This move spends 1 AP; you choose again afterward.",
          criteria,
        },
      },
    },
  };
}

/** Route only on observed/remembered terrain; if the goal is disconnected, walk to a reachable exploration boundary. */
export function knownRoute(
  view,
  actor,
  goal,
  graph,
  search,
  memory,
  exploration,
) {
  const origin = graph.index.keyOf(actor.pos);
  const goalKey = graph.index.keyOf(goal);
  if (search.costs.has(goalKey) && goalKey !== origin) {
    return {
      kind: "known-route",
      target: goal,
      path: readPath(search, graph, origin, goalKey),
    };
  }
  if (goalKey === origin) return undefined;
  // Retain a chosen frontier while approaching it; reaching it exhausts it, so stateless rescoring cannot oscillate.
  if (
    memory.frontier !== undefined &&
    (memory.frontier === origin || !search.costs.has(memory.frontier))
  ) {
    memory.exhausted.add(memory.frontier);
    memory.frontier = undefined;
  }
  if (
    exploration &&
    memory.knowledgeSize !== exploration.observed.map.tiles.length
  ) {
    memory.frontier = undefined;
    memory.knowledgeSize = exploration.observed.map.tiles.length;
  }
  if (memory.frontier === undefined) {
    const unitClass = passMaskFor(actor.passClass);
    const knownColumns = new Set(
      view.map.tiles.map((tile) => `${tile.x},${tile.z}`),
    );
    const frontiers = [...search.tiles.values()].filter((tile) => {
      const key = graph.index.keyOf(tile);
      return (
        key !== origin &&
        !memory.exhausted.has(key) &&
        (exploration?.probes.has(key) ||
          DIRECTIONS.some((direction) => {
            const neighbour = stepGridPos(tile, direction);
            if (
              !graph.index.inBounds(neighbour) ||
              wallKindBlocks(tile.walls[direction], unitClass)
            )
              return false;
            if (exploration)
              return !knownColumns.has(`${neighbour.x},${neighbour.z}`);
            // An observed adjacent surface (including a one-layer step) is not unexplored terrain.
            return [0, -1, 1].every(
              (dy) =>
                !graph.index.get(neighbour.x, neighbour.y + dy, neighbour.z),
            );
          }))
      );
    });
    frontiers.sort((a, b) => {
      const aScore =
        search.costs.get(graph.index.keyOf(a)) +
        manhattanDistance(a, goal) +
        Math.abs(a.y - goal.y);
      const bScore =
        search.costs.get(graph.index.keyOf(b)) +
        manhattanDistance(b, goal) +
        Math.abs(b.y - goal.y);
      return (
        aScore - bScore ||
        manhattanDistance(a, goal) - manhattanDistance(b, goal) ||
        graph.index.keyOf(a) - graph.index.keyOf(b)
      );
    });
    if (!frontiers.length) return undefined;
    memory.frontier = graph.index.keyOf(frontiers[0]);
  }
  const path = readPath(search, graph, origin, memory.frontier);
  return { kind: "explore-frontier", target: path.at(-1), path };
}

/** Hypothesize one infantry floor cell beyond each observed door. Never inspect the hidden map to validate it. */
export function doorHypotheses(observed, rejected = new Set()) {
  const graph = buildMoveGraph(observed.map);
  const inferred = new Map();
  const probes = new Set();
  for (const tile of observed.map.tiles)
    for (const direction of DIRECTIONS) {
      if (tile.walls[direction] !== "door") continue;
      const neighbour = stepGridPos(tile, direction);
      if (!graph.index.inBounds(neighbour) || graph.index.getAt(neighbour))
        continue;
      const key = graph.index.keyOf(neighbour);
      if (rejected.has(key)) continue;
      probes.add(key);
      const previous = inferred.get(key);
      inferred.set(key, {
        ...neighbour,
        surface: "floor",
        pass: 1,
        coverProvided: 0,
        blocksLos: false,
        walls: { ...previous?.walls, [oppositeDirection(direction)]: "door" },
      });
    }
  return {
    view: {
      ...observed,
      map: {
        ...observed.map,
        tiles: [...observed.map.tiles, ...inferred.values()],
      },
    },
    probes,
  };
}

/** Recover the game's own shortest known path, without reading the full-map scoring oracle. */
function readPath(search, graph, origin, destination) {
  const path = [];
  for (let key = destination; key !== origin; key = search.parents.get(key)) {
    const tile = search.tiles.get(key);
    assert(
      tile && search.parents.has(key),
      "Known route must connect to the actor",
    );
    path.push({ x: tile.x, y: tile.y, z: tile.z });
  }
  return path.reverse();
}
