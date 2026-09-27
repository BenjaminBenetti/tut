import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileIndex } from "../../../mapgen/service/tile-index";
import { isTrapped } from "../../model/civilian";
import type { ObjectiveId, TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { isBurrowed, isCombatUnit, takesOrders } from "../../model/unit";
import type { MoveGraph } from "../movement-service";
import { buildMoveGraph } from "../movement-service";
import {
  OBJECTIVE_RULES,
  objectiveRulesFor,
} from "../objectives/objective-rules";
import { perceivedUnits } from "../vision-service";

// ===========================================
// What the player can see (#1179, campaign arc §12)
// ===========================================
//
// A modelled player decides from what the screen shows and nothing
// else: its own units, the bugs its side has spotted, the objective
// markers the HUD hangs over the fog, and the ground it has explored.
// Everything a strategy or a policy reads about the enemy comes through
// this view, so a player never "knows where she is" (the mission
// agents' drivers often did).
//
//   TacticalState ──► observe ──► PlayerView
//                                  ├── own       units that take orders
//                                  ├── force     squads and mechs standing
//                                  ├── enemies   spotted, living, above ground
//                                  └── places    objective id ──► blips and targets in sight

/** One side's reading of the mission, as the HUD shows it. */
export interface PlayerView {
  /** The mission itself: for the force's own units and the rules' own previews. */
  readonly mission: TacticalState;
  /** The map's movement graph, shared by every query this phase. */
  readonly graph: MoveGraph;
  /** Living TDF units the player can order: squads, mechs, freed civilians. */
  readonly own: readonly Unit[];
  /** Living squads and mechs: the force whose standing keeps the mission open. */
  readonly force: readonly Unit[];
  /** Living bugs the side has spotted and that stand above ground. */
  readonly enemies: readonly Unit[];
  /**
   * Where each open objective is, by objective: the fog blips plus the
   * targets drawn in plain sight, which is everything the HUD shows.
   */
  readonly places: ReadonlyMap<ObjectiveId, readonly TileCoord[]>;
  /** Tile keys the side has explored. */
  readonly explored: ReadonlySet<number>;
}

// ===========================================
// Observing
// ===========================================

/** The movement graph for each map, built once: the map object changes when a wall falls. */
const GRAPHS = new WeakMap<TacticalMap, MoveGraph>();

/**
 * The shared movement graph for `map`, built on first use. Demolition
 * replaces the map object, so a changed map gets a fresh graph.
 */
export function graphFor(map: TacticalMap): MoveGraph {
  let graph = GRAPHS.get(map);
  if (graph === undefined) {
    graph = buildMoveGraph(map);
    GRAPHS.set(map, graph);
  }
  return graph;
}

/** What the TDF side can see of `mission` right now. */
export function observe(mission: TacticalState): PlayerView {
  const graph = graphFor(mission.map);
  const own = mission.units.filter(
    (unit) => unit.team === "tdf" && unit.hp > 0 && takesOrders(unit),
  );
  const enemies = perceivedUnits(mission, "tdf", graph.index).filter(
    (unit) => unit.team === "bugs" && unit.hp > 0 && !isBurrowed(unit),
  );
  return {
    mission,
    graph,
    own,
    force: own.filter(isCombatUnit),
    enemies,
    places: objectivePlaces(mission),
    explored: new Set(mission.vision.tdf?.explored ?? []),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Where each open objective is as the HUD shows it (#1173): the places
 * its kind blips, whether the blip is drawn over fog or dropped because
 * the target's own model is in sight. The same filter as
 * `objectiveMarkers`, less the visibility test.
 */
export function objectivePlaces(
  mission: TacticalState,
): ReadonlyMap<ObjectiveId, readonly TileCoord[]> {
  const places = new Map<ObjectiveId, readonly TileCoord[]>();
  for (const objective of mission.objectives) {
    const kind = objectiveRulesFor(objective, OBJECTIVE_RULES);
    const open =
      kind.workedUntilEmpty === true ||
      (!objective.complete && objective.failed !== true);
    if (!open) {
      continue;
    }
    const single = kind.markers ? undefined : kind.marker?.(objective, mission);
    const list =
      kind.markers?.(objective, mission) ??
      (single === undefined ? [] : [single]);
    if (list.length > 0) {
      places.set(objective.id, list);
    }
  }
  return places;
}

/** Whether `tile` is one of the extraction zone's tiles. */
export function onExtraction(mission: TacticalState, tile: TileCoord): boolean {
  return mission.extraction.some(
    (zone) => zone.x === tile.x && zone.y === tile.y && zone.z === tile.z,
  );
}

/** Whether `tile` is ground the side has explored (a spawner or a wreck seen there stays known). */
export function isExplored(view: PlayerView, tile: TileCoord): boolean {
  const index: TileIndex = view.graph.index;
  return index.inBounds(tile) && view.explored.has(index.keyOf(tile));
}

/** Whether a unit is a civilian group the force has already freed. */
export function isFreedCivilian(unit: Unit): boolean {
  return unit.kind === "civilian" && !isTrapped(unit);
}
