import type { TileCoord } from "../../mapgen/model/tile-coord";
import { STOREY_LAYERS } from "../../core/model/elevation";
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

import type { JevDestinationSources } from "./jev-destinations";

/** Authoritative interaction check at a hypothetical route endpoint. */
export type JevHarvestArrival = (
  carcassId: string,
  position: TileCoord,
) => boolean;

// ===========================================
// Movement intents
// ===========================================

/** Plan routes using the full map layout and faction-known units for occupancy and targets. */
export function jevMovementCandidates(
  navigation: TacticalState,
  actor: Unit,
  destinations: JevDestinationSources,
  names: Readonly<Record<string, string>>,
  canHarvestFrom: JevHarvestArrival = () => false,
): readonly JevCandidate[] {
  if (actor.kind === "turret" || actor.ap <= 0 || actor.hp <= 0) return [];
  const budget = moveBudget(navigation, { ...actor, ap: 1 });
  if (budget <= 0) return [];
  const graph = buildMoveGraph(navigation.map);
  // One whole-map search serves all destinations; only a one-AP prefix is executable.
  const search = searchMoves(
    navigation,
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
  const size = unitFootprintSize(navigation, actor);
  const providers = {
    entities: () => {
      for (const target of destinations.entities) {
        if (target.id === actor.id || target.hp <= 0) continue;
        const targetSize = unitFootprintSize(navigation, target);
        const approaches = approachKeys(
          graph,
          search,
          size,
          target.pos,
          targetSize,
          actor,
        );
        const endpoint = cheapest(search, approaches);
        // Already adjacent means no move; unreachable entities are not invented destinations.
        const name =
          names[target.id] ??
          navigation.templates[target.templateId]?.name ??
          target.id;
        const type =
          target.kind === "mech"
            ? "Mech"
            : (navigation.templates[target.templateId]?.name ?? target.kind);
        add(
          `move_to_entity:${target.id}`,
          `Move toward ${name} (${type}, ${target.team === actor.team ? "friendly" : "hostile"}).`,
          endpoint,
          {
            intent: "approach_entity",
            targetId: target.id,
            targetName: name,
            targetPosition: target.pos,
            routeKind: "known-route",
          },
        );
      }
    },
    objectives: () => {
      for (const objective of destinations.objectives) {
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
        add(
          `move_to_objective:${objective.id}`,
          `Move toward ${objective.id} (${objective.kind}); arrival alone does not complete it.`,
          endpoint,
          {
            intent: "approach_objective",
            targetId: objective.id,
            targetName: objective.id,
            targetPosition: objective.position,
            routeKind: "known-route",
          },
        );
      }
    },
    extraction: () => {
      // Extraction requires the actor's anchor inside the zone, not merely beside
      // it. Choose the cheapest reachable zone tile, including floors and blockers.
      const extraction = cheapest(
        search,
        destinations.extraction
          .filter((tile) => graph.index.inBounds(tile))
          .map((tile) => graph.index.keyOf(tile))
          .filter((key) => search.costs.has(key)),
      );
      add(
        "move_to_extraction",
        actor.team === "tdf"
          ? "Move into the extraction zone to leave the battlefield. If arrival spends the last AP, extract automatically for zero AP after the walk; otherwise choose Extract next. To guard the zone without leaving, choose another movement intent."
          : "Move toward the TDF extraction zone to contest it. Bugs cannot extract.",
        extraction,
        {
          intent: "approach_extraction",
          extractOnArrival: actor.team === "tdf",
          targetId: "extraction",
          targetName: "Extraction zone",
          targetPosition: destinations.extraction.find(
            (tile) => graph.index.keyOf(tile) === extraction,
          ),
          routeKind: "known-route",
        },
      );
    },
    visible_carcasses: () => {
      for (const carcass of destinations.visible_carcasses) {
        // Ask the real harvest rules for both capability and range. A mech or
        // bug cannot be offered an infantry interaction it could never use.
        if (carcass.harvested || !canHarvestFrom(carcass.id, carcass.pos))
          continue;
        const endpoint = [...search.costs.keys()]
          .sort((a, b) => search.costs.get(a)! - search.costs.get(b)! || a - b)
          .find((key) => canHarvestFrom(carcass.id, search.tiles.get(key)!));
        add(
          `move_to_carcass:${carcass.id}`,
          `Move within harvesting range of carcass ${carcass.id} (${String(carcass.techPoints)} tech points). Arrival does not harvest it; Harvest spends its own AP.`,
          endpoint,
          {
            intent: "approach_carcass",
            targetId: carcass.id,
            targetName: `Carcass ${carcass.id}`,
            targetPosition: carcass.pos,
            routeKind: "known-route",
          },
        );
      }
    },
    radar_contacts: () => {
      const seen = new Set<string>();
      for (const contact of destinations.radar_contacts) {
        const position = contact.pos;
        const id = `${String(position.x)}:${String(position.y)}:${String(position.z)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        add(
          `investigate_radar:${id}`,
          `Investigate radar ${contact.kind} contact at (${String(position.x)}, ${String(position.y)}, ${String(position.z)}). Position only; identity, health and capabilities are unknown. Approach to gain sight, not to attack.`,
          cheapest(
            search,
            approachKeys(graph, search, size, position, 1, actor),
          ),
          {
            intent: "investigate_radar",
            targetName: `Radar contact ${id}`,
            targetPosition: position,
            routeKind: "known-route",
          },
        );
      }
    },
    last_seen: () => {
      for (const sighting of destinations.last_seen) {
        add(
          `investigate_last_seen:${sighting.id}`,
          `Investigate the last-seen location of ${sighting.id}. This is a historical position; the entity may have moved or died. Approach to gain sight, not to attack.`,
          cheapest(
            search,
            approachKeys(graph, search, size, sighting.position, 1, actor),
          ),
          {
            intent: "investigate_last_seen",
            targetId: sighting.id,
            targetName: `Last sighting of ${sighting.id}`,
            targetPosition: sighting.position,
            routeKind: "known-route",
          },
        );
      }
    },
  } satisfies Readonly<Record<keyof JevDestinationSources, () => void>>;
  for (const provide of Object.values(providers)) provide();
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
  const hostiles = navigation.units.filter(
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
            unitFootprintSize(navigation, enemy),
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
// Routes and arrival
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

/** Require an open edge beside an entity; a link across storeys is a route, not arrival. */
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
    )) {
      // Natural half-height steps are adjacent; stairs and ladders across floors are not.
      if (Math.abs(neighbour.y - target.y) >= STOREY_LAYERS) continue;
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
