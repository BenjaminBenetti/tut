import { placeBroodmother } from "../../../bugs/service/broodmother-placement";
import { BROODMOTHER_SPECIES_ID } from "../../../bugs/service/broodmother-service";
import type { Result } from "../../../core/model/result";
import { err, ok } from "../../../core/model/result";
import { manhattanDistance } from "../../../core/service/grid-math";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { ReachabilitySnapshot } from "../../../mapgen/service/hatch-space";
import { hatchTiles, snapshotMap } from "../../../mapgen/service/hatch-space";
import type { Mission } from "../../../overworld/model/mission";
import type { BugUnitSource } from "../../model/bug-unit-source";
import type {
  MissionSetupDeps,
  MissionSetupRule,
} from "../../model/mission-setup-rule";
import type { TacticalError } from "../../model/tactical-error";
import type {
  KillBroodmotherObjective,
  TacticalState,
} from "../../model/tactical-state";
import { OBJECTIVE_ID_PREFIX } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import {
  footprintSizeOf,
  footprintTiles,
  unitFootprintSize,
} from "../footprint-service";
import { touchesMapEdge } from "../map-edge-service";
import type { MoveGraph, TileKey } from "../movement-service";
import { buildMoveGraph, searchMoves } from "../movement-service";
import { standEggSpawners } from "./infestation-clearance-setup";

// ===========================================
// Constants
// ===========================================

/**
 * How far, in tiles, the Broodmother's lair keeps from every map edge
 * and (Manhattan) from every deploy tile, measured to the nearest tile
 * of her 3×3 block (campaign arc §6.8).
 *
 * Twelve, from her own numbers (`BUG_SPECIES.broodmother`,
 * `BROODMOTHER_TUNING`):
 *
 * - **Edges.** She walks 5 tiles an action and has two, so 10 tiles a
 *   bug phase at most, and once she runs she limps on one
 *   (`BROODMOTHER_TUNING.fleeingActions`), 5 tiles. From 12 tiles in, a
 *   Broodmother who turns to flee on her very first bug phase still
 *   needs two more to leave: the squad always gets two player turns
 *   between her turning and her escape.
 * - **Deploy.** 12 is her `standOff`, the distance she keeps from where
 *   the swarm last saw the squad, and past a carbine's 8 plus a squad's
 *   first move: the hunt starts with finding her, not with a volley
 *   from the drop zone.
 *
 * A medium map, the smallest an Alpha Hunt is played on from d2, has
 * ground that far from both; a map without it falls back as
 * `broodmotherLair` describes.
 */
export const BROODMOTHER_LAIR_CLEARANCE = 12;

/**
 * Action points lent to the search for her way out, so it is bounded by
 * the map rather than a turn's budget: her flight searches the same way.
 */
const ESCAPE_SEARCH_AP = 10_000;

// ===========================================
// Rule
// ===========================================

/**
 * `alpha-hunt` (campaign arc §6.8): kill the Broodmother before she
 * reaches the map edge, then board the drop ship.
 *
 * ```
 *   map.hooks.objectives (egg-spawner) ──► standEggSpawners: her nests, no
 *                                          objective (fewer than a clearance's:
 *                                          MISSION_TYPES["alpha-hunt"])   ids: spawner-*
 *   broodmotherLair(map)               ──► the lair tiles, best first
 *   placeBroodmother at the first that holds her and from which her
 *        block can walk to an edge (else the first that holds her)
 *        hp = broodmotherHp(difficulty, spec.scars), persona broodmother  ids: unit-*
 *        name = mission.alphaHunt.name
 *   one kill-broodmother objective on her unit                         ids: objective-*
 * ```
 *
 * Her clutches (every 3 turns) and her flight (at half health) are the
 * Broodmother's own phase steps; the edge waves run on the spawn
 * tuning's schedule, as a clearance's do.
 *
 * Refuses with `unknown-unit-type` when `deps.species` has no
 * Broodmother (the composition root always passes the shipped
 * species), and with `map-recipe` when no ground the squad can walk to
 * has room for her.
 */
export const ALPHA_HUNT_SETUP: MissionSetupRule = {
  typeId: "alpha-hunt",
  /** Her nests, her, and the one objective: kill her. */
  setup(state, map, mission, deps) {
    const species = deps.species?.find(
      (candidate) => candidate.id === BROODMOTHER_SPECIES_ID,
    );
    if (species === undefined) {
      return err({
        kind: "unknown-unit-type",
        unitKind: "bug",
        id: BROODMOTHER_SPECIES_ID,
      });
    }
    const nested = standEggSpawners(state, map, mission, deps);
    return standBroodmother(nested, map, mission, species, deps);
  },
};

// ===========================================
// Lair
// ===========================================

/**
 * Where the Broodmother may be placed, best first (campaign arc §6.8):
 * every anchor whose whole 3×3 block lies on ground the squad can walk
 * to from the deploy zone and on no deploy or extraction tile, ranked
 *
 * ```
 *   tier 0   ≥ clearance from every edge and from every deploy tile
 *   tier 1   ≥ clearance from every edge
 *   tier 2   anything else on the squad's ground, the furthest from
 *            its nearest edge first
 *   then: the block's centre nearest the map's centre (Manhattan),
 *   then lowest z, then lowest x
 * ```
 *
 * So she starts in the middle of the map, as far from every edge as the
 * map allows, out of the drop zone's first reach; the lower tiers keep
 * a cramped map playable rather than refusing it. Pure; nothing drawn.
 *
 * @param map - The generated map.
 * @param extraction - The extraction tiles, which she never covers.
 * @param size - Her footprint's side, 3.
 * @param clearance - Tiles kept from the edges and the deploy zone.
 * @returns Anchors to try, best first; empty when the squad can reach nowhere.
 */
export function broodmotherLair(
  map: TacticalMap,
  extraction: readonly TileCoord[],
  size: number,
  clearance: number = BROODMOTHER_LAIR_CLEARANCE,
): readonly TileCoord[] {
  const snapshot = snapshotMap(map);
  const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
  const ground = squadGround(snapshot, deploy);
  const walkable = new Set(ground.map((tile) => snapshot.index.keyOf(tile)));
  for (const tile of [...deploy, ...extraction]) {
    walkable.delete(snapshot.index.keyOf(tile));
  }
  const centre = {
    x: Math.floor(map.width / 2),
    y: 0,
    z: Math.floor(map.depth / 2),
  };
  const ranked: {
    anchor: TileCoord;
    tier: number;
    depth: number;
    distance: number;
  }[] = [];
  for (const anchor of ground) {
    const fromEdge = edgeDistance(anchor, size, map);
    const block = footprintTiles(anchor, size);
    if (
      fromEdge < 0 ||
      !block.every((tile) => walkable.has(snapshot.index.keyOf(tile)))
    ) {
      // Off the map's far side, or on ground she cannot stand on whole.
      continue;
    }
    const clearOfEdges = fromEdge >= clearance;
    const clearOfDeploy = block.every((tile) =>
      deploy.every((d) => manhattanDistance(tile, d) >= clearance),
    );
    ranked.push({
      anchor,
      tier: clearOfEdges ? (clearOfDeploy ? 0 : 1) : 2,
      // Short of the clearance, the deeper in the better; clear of it,
      // every depth is as good and the centre decides.
      depth: clearOfEdges ? clearance : fromEdge,
      distance: manhattanDistance(
        {
          x: anchor.x + Math.floor(size / 2),
          y: 0,
          z: anchor.z + Math.floor(size / 2),
        },
        centre,
      ),
    });
  }
  return ranked
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.depth - a.depth ||
        a.distance - b.distance ||
        a.anchor.z - b.anchor.z ||
        a.anchor.x - b.anchor.x,
    )
    .map(({ anchor }) => ({ x: anchor.x, y: anchor.y, z: anchor.z }));
}

// ===========================================
// Helpers
// ===========================================

/**
 * Stands her at the first lair tile that holds her and has a way out,
 * names her, and adds the objective on her unit; refused when none
 * holds her at all.
 *
 * ```
 *   for each lair anchor, best first
 *     already known to be shut in ──► skip
 *     she does not fit            ──► skip
 *     her block can walk to an edge (escapeRoute) ──► she stands here
 *     otherwise ──► every anchor she could reach from it is shut in too
 *   none had a way out ──► the first that held her (a cramped map still plays)
 * ```
 *
 * A way out matters because the hunt is lost when she reaches an edge:
 * a lair in a pocket her 3×3 block cannot leave (a fenced yard, a court
 * between buildings) is a hunt she can never escape.
 */
function standBroodmother(
  state: TacticalState,
  map: TacticalMap,
  mission: Mission,
  species: BugUnitSource,
  deps: MissionSetupDeps,
): Result<TacticalState, TacticalError> {
  const lair = broodmotherLair(map, state.extraction, footprintSizeOf(species));
  const graph = buildMoveGraph(map);
  const shutIn = new Set<TileKey>();
  let fallback: TacticalState | undefined;
  for (const anchor of lair) {
    if (shutIn.has(graph.index.keyOf(anchor))) {
      continue;
    }
    const placed = placeBroodmother(state, anchor, {
      ids: deps.ids,
      species,
      scars: mission.alphaHunt?.scars ?? 0,
    });
    const mother = placed.units[placed.units.length - 1];
    if (placed === state || mother === undefined) {
      continue;
    }
    const route = escapeRoute(placed, mother, graph);
    if (route.exits) {
      return ok(huntFor(placed, mother, mission, deps));
    }
    for (const key of route.reached) {
      shutIn.add(key);
    }
    fallback ??= placed;
  }
  const mother = fallback?.units[fallback.units.length - 1];
  if (fallback === undefined || mother === undefined) {
    return err({
      kind: "map-recipe",
      reason: "no ground the squad can reach has room for the Broodmother",
    });
  }
  return ok(huntFor(fallback, mother, mission, deps));
}

/** The mission with her named and one kill-broodmother objective on her. */
function huntFor(
  placed: TacticalState,
  mother: Unit,
  mission: Mission,
  deps: MissionSetupDeps,
): TacticalState {
  const objective: KillBroodmotherObjective = {
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "kill-broodmother",
    targetId: mother.id,
    complete: false,
    failed: false,
  };
  const name = mission.alphaHunt?.name;
  return {
    ...placed,
    units: placed.units.map((unit): Unit =>
      unit.id === mother.id && name !== undefined ? { ...unit, name } : unit,
    ),
    objectives: [...placed.objectives, objective],
  };
}

/**
 * Whether her block can walk from where she stands to a tile that
 * touches the map edge, as her flight searches it (`searchMoves` with a
 * budget no map exhausts, the other units in the way), and every anchor
 * the search reached, which share her answer.
 */
function escapeRoute(
  mission: TacticalState,
  mother: Unit,
  graph: MoveGraph,
): { readonly exits: boolean; readonly reached: readonly TileKey[] } {
  const size = unitFootprintSize(mission, mother);
  const search = searchMoves(
    mission,
    { ...mother, ap: ESCAPE_SEARCH_AP },
    graph,
  );
  const reached = [...search.tiles.keys()];
  const exits = [...search.tiles.values()].some((tile) =>
    touchesMapEdge(mission.map, tile, size),
  );
  return { exits, reached };
}

/**
 * Steps a `size` block at `anchor` must walk before any of it stands on
 * an edge tile, which is where `touchesMapEdge` lets her leave.
 */
function edgeDistance(
  anchor: TileCoord,
  size: number,
  map: Pick<TacticalMap, "width" | "depth">,
): number {
  return Math.min(
    anchor.x,
    anchor.z,
    map.width - (anchor.x + size),
    map.depth - (anchor.z + size),
  );
}

/**
 * Every tile infantry can walk to from the deploy zone, in discovery
 * order from its first tile infantry can stand on: the squad's ground.
 */
function squadGround(
  snapshot: ReachabilitySnapshot,
  deploy: readonly TileCoord[],
): readonly TileCoord[] {
  for (const tile of deploy) {
    const found = hatchTiles(
      snapshot,
      tile,
      Number.POSITIVE_INFINITY,
      PassMask.INFANTRY,
    );
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}
