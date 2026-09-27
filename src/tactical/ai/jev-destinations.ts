import { tileIndexOf } from "../../mapgen/service/shared-tile-index";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { ObjectiveRulesTable } from "../model/objective-rules";
import type { RadarContact } from "../model/radar";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import {
  OBJECTIVE_RULES,
  objectiveRulesFor,
} from "../service/objectives/objective-rules";
import { radarContacts } from "../service/radar-service";
import type { JevMovementRules } from "../model/jev-movement-rules";
import { unitFootprintSize } from "../service/footprint-service";
import { edgeExits, touchesMapEdge } from "../service/map-edge-service";
import { buildMoveGraph, searchMoves } from "../service/movement-service";

/** Public mission destination, without hidden target condition. */
export interface JevObjective {
  readonly id: string;
  readonly kind: string;
  readonly complete: boolean;
  readonly position?: TileCoord;
  /** Defence targets are also exposed as entity destinations when known to the faction. */
  readonly target_ids?: readonly string[];
  readonly failed?: boolean;
}

/** The same destination sources feed observation and the exhaustive movement provider registry. */
export interface JevDestinationSources {
  readonly entities: readonly Unit[];
  readonly objectives: readonly JevObjective[];
  readonly extraction: readonly TileCoord[];
  readonly visible_carcasses: TacticalState["carcasses"];
  readonly radar_contacts: readonly RadarContact[];
  readonly last_seen: readonly {
    readonly id: string;
    readonly position: TileCoord;
    readonly knowledge: string;
  }[];
  /**
   * The edge anchor a fleeing actor leaves the map from (#1179): at most
   * one tile, empty for an actor that cannot flee or has no way out.
   */
  readonly map_edge_exit: readonly TileCoord[];
}

/** Project only shared faction intel; cleared historical locations are no longer investigation goals. */
export function jevDestinations(
  mission: TacticalState,
  view: TacticalState,
  actor: Unit,
  movement?: JevMovementRules,
): JevDestinationSources {
  const vision = mission.vision[actor.team];
  const index = tileIndexOf(mission.map);
  const visible = new Set(vision.visible);
  return {
    entities: view.units,
    objectives: jevObjectives(mission),
    extraction: mission.extraction,
    visible_carcasses: view.carcasses,
    radar_contacts: radarContacts(mission, actor.team),
    last_seen: Object.entries(vision.lastSeen)
      .filter(
        ([id, position]) =>
          !vision.spotted.includes(id) && !visible.has(index.keyOf(position)),
      )
      .map(([id, position]) => ({
        id,
        position,
        knowledge:
          "Historical sighting; current location, health and survival unknown",
      })),
    map_edge_exit:
      actor.fleeing === true || movement?.canFlee(actor) === true
        ? jevMapEdgeExit({ ...view, map: mission.map }, actor)
        : [],
  };
}

/**
 * Where a fleeing actor leaves the map (#1179, arc §6.8), found the way
 * the Broodmother's fallback finds her flight: the reachable anchor
 * whose block touches the map edge by the cheapest route over the whole
 * map (`edgeExits`). Ties go to the lowest tile key rather than the
 * fallback's RNG, so an observation never draws. The route search is
 * the movement offer's own, on the same navigation state, so the exit
 * is always one of its destinations.
 *
 * ```
 *   on the edge already ──► []        (the flight step takes her off)
 *   no edge reachable   ──► []
 *   otherwise           ──► [cheapest exit anchor]
 * ```
 *
 * @param navigation - The faction's view with the full map layout.
 * @param actor - The fleeing actor.
 * @returns The exit anchor, or nothing.
 */
function jevMapEdgeExit(
  navigation: TacticalState,
  actor: Unit,
): readonly TileCoord[] {
  const size = unitFootprintSize(navigation, actor);
  if (touchesMapEdge(navigation.map, actor.pos, size)) return [];
  const search = searchMoves(
    navigation,
    { ...actor, ap: Number.MAX_SAFE_INTEGER },
    buildMoveGraph(navigation.map),
  );
  const exit = [...edgeExits(navigation.map, search, size)].sort(
    (a, b) => a.cost - b.cost || a.key - b.key,
  )[0];
  const tile = exit === undefined ? undefined : search.tiles.get(exit.key);
  return tile === undefined ? [] : [{ x: tile.x, y: tile.y, z: tile.z }];
}

/**
 * Objective locations are public intel; unobserved nest health is not.
 * Each kind's rules say where it is (ADR 0013 §2.3): a nest's tile, a
 * defence's generator ids. `failed` is reported whenever the objective
 * records it, so a defence always says, and a spawner objective says
 * once a deadline has failed it.
 */
export function jevObjectives(
  mission: TacticalState,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): readonly JevObjective[] {
  return mission.objectives.map((objective): JevObjective => {
    const destination =
      objectiveRulesFor(objective, rules).destination?.(objective, mission) ??
      {};
    return {
      id: objective.id,
      kind: objective.kind,
      complete: objective.complete,
      ...(destination.position === undefined
        ? {}
        : { position: destination.position }),
      ...(destination.targetIds === undefined
        ? {}
        : { target_ids: destination.targetIds }),
      ...(objective.failed === undefined ? {} : { failed: objective.failed }),
    };
  });
}
