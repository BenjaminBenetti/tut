import type { BugSpeciesId } from "../../../content/model/bug-species-id";
import type { Result } from "../../../core/model/result";
import { err, ok } from "../../../core/model/result";
import { manhattanDistance } from "../../../core/service/grid-math";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { ReachabilitySnapshot } from "../../../mapgen/service/hatch-space";
import { hatchTiles, snapshotMap } from "../../../mapgen/service/hatch-space";
import type { BugUnitSource } from "../../model/bug-unit-source";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import { spawnerTraitsOf } from "../../model/spawner-variant";
import type { StorySetupRule } from "../../model/story-setup-rule";
import type { TacticalError } from "../../model/tactical-error";
import type { Spawner, TacticalState } from "../../model/tactical-state";
import { addCaptureObjective } from "../objectives/capture-specimen-objective";
import { placeBugAtFirst } from "../placed-bug-service";

// ===========================================
// Constants
// ===========================================

/** The species Live Specimen wants alive (campaign arc §6.9). */
export const LIVE_SPECIMEN_SPECIES: BugSpeciesId = "lurker";

/**
 * Lurkers placed at the start, one per nest, nearest nest first. Two,
 * so a lurker killed by a stray shot before it could be netted is not
 * the end of the hunt; the rolled mix hatches more on top.
 */
export const LIVE_SPECIMEN_PLACED_LURKERS = 2;

/**
 * How far, in Manhattan tiles, the fallback keeps a lurker from every
 * deploy tile when no nest has room for one: a turn's walk, so the
 * squad lands before the hunt starts.
 */
export const LIVE_SPECIMEN_FALLBACK_DISTANCE = 8;

/** Unbounded search radius: the whole of the squad's reachable ground. */
const EVERYWHERE = Number.POSITIVE_INFINITY;

// ===========================================
// Rule
// ===========================================

/**
 * Live Specimen (campaign arc §6.9, #1179) on top of its clearance: the
 * capture decides the mission, and a lurker is guaranteed on the map.
 *
 * ```
 *   the clearance's setup has run: nests + destroy-spawner objectives
 *   1. every objective so far ──► optional: the nests pay, but a win
 *                                 does not wait for them
 *   2. addCaptureObjective(lurker)        the deciding objective   ids: objective-*
 *   3. placed lurkers, LIVE_SPECIMEN_PLACED_LURKERS of them       ids: unit-*
 *        den i = the i-th nearest live nest to the deploy zone
 *                (wrapping when there are fewer nests than lurkers)
 *        tile  = the first ground around it, within its hatch radius,
 *                that the squad can walk to and that is neither a
 *                deploy nor an extraction tile, with room for a lurker
 *   4. no den had room ──► the first reachable tile at least
 *        LIVE_SPECIMEN_FALLBACK_DISTANCE from every deploy tile, else
 *        any reachable tile off the deploy zone
 *   nothing reachable could hold one ──► refused (map-recipe)
 * ```
 *
 * So the squad always has a lurker to hunt from turn 1, and the nests
 * and the edges keep hatching more by the offer's mix. Killing every
 * lurker does not fail the capture: the edges never fall quiet on a
 * clearance, so the squad can keep hunting while it has a net, or
 * extract and try again in five days.
 *
 * Refuses with `unknown-unit-type` when `deps.species` has no lurker:
 * the composition root always passes the shipped species.
 */
export const LIVE_SPECIMEN_SETUP: StorySetupRule = {
  storyId: "live-specimen",

  /** The capture decides, the nests are optional, and the lurkers wait by the nests. */
  setup(state, map, _mission, deps) {
    const lurker = deps.species?.find(
      (species) => species.id === LIVE_SPECIMEN_SPECIES,
    );
    if (lurker === undefined) {
      return err({
        kind: "unknown-unit-type",
        unitKind: "bug",
        id: LIVE_SPECIMEN_SPECIES,
      });
    }
    const optional: TacticalState = {
      ...state,
      objectives: state.objectives.map((objective) => ({
        ...objective,
        optional: true,
      })),
    };
    const wanted = addCaptureObjective(optional, LIVE_SPECIMEN_SPECIES, deps);
    return placeLurkers(wanted, map, lurker, deps);
  },
};

// ===========================================
// Placement
// ===========================================

/**
 * Stands the placed lurkers: one at each den in turn, then the fallback
 * if no den had room. Refuses only when nothing the squad can reach
 * could hold a lurker.
 */
function placeLurkers(
  state: TacticalState,
  map: TacticalMap,
  lurker: BugUnitSource,
  deps: MissionSetupDeps,
): Result<TacticalState, TacticalError> {
  const snapshot = snapshotMap(map);
  const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
  const squadGround = reachableTiles(snapshot, deploy);
  const reachable = new Set(
    squadGround.map((tile) => snapshot.index.keyOf(tile)),
  );
  const banned = new Set(
    [...deploy, ...state.extraction].map((tile) => snapshot.index.keyOf(tile)),
  );
  const open = (tile: TileCoord): boolean => {
    const key = snapshot.index.keyOf(tile);
    return reachable.has(key) && !banned.has(key);
  };

  let current = state;
  const nests = nestsNearestFirst(state.spawners, deploy);
  for (let den = 0; den < LIVE_SPECIMEN_PLACED_LURKERS; den++) {
    const nest = nests[den % Math.max(1, nests.length)];
    if (nest === undefined) {
      break;
    }
    const ground = hatchTiles(
      snapshot,
      nest.pos,
      nest.hatchRadius,
      PassMask.INFANTRY,
    ).filter(open);
    current = placeBugAtFirst(current, lurker, ground, deps);
  }
  if (current.units.length > state.units.length) {
    return ok(current);
  }

  const everywhere = squadGround.filter(open);
  const far = everywhere.filter((tile) =>
    deploy.every(
      (d) => manhattanDistance(tile, d) >= LIVE_SPECIMEN_FALLBACK_DISTANCE,
    ),
  );
  for (const ground of [far, everywhere]) {
    const placed = placeBugAtFirst(current, lurker, ground, deps);
    if (placed.units.length > state.units.length) {
      return ok(placed);
    }
  }
  return err({
    kind: "map-recipe",
    reason: "no ground the squad can reach has room for the specimen",
  });
}

// ===========================================
// Helpers
// ===========================================

/**
 * The nests still standing that hatch (egg spawners, not pods), nearest
 * to the deploy zone first by Manhattan distance to its closest tile,
 * ties in spawner order.
 */
function nestsNearestFirst(
  spawners: readonly Spawner[],
  deploy: readonly TileCoord[],
): readonly Spawner[] {
  const distance = (spawner: Spawner): number =>
    Math.min(...deploy.map((tile) => manhattanDistance(tile, spawner.pos)));
  return spawners
    .filter((spawner) => !spawner.destroyed && spawnerTraitsOf(spawner).hatches)
    .map((spawner, order) => ({ spawner, order, distance: distance(spawner) }))
    .sort((a, b) => a.distance - b.distance || a.order - b.order)
    .map(({ spawner }) => spawner);
}

/**
 * Every tile infantry can walk to from the deploy zone, in discovery
 * order from its first tile infantry can stand on: the squad's ground.
 */
function reachableTiles(
  snapshot: ReachabilitySnapshot,
  deploy: readonly TileCoord[],
): readonly TileCoord[] {
  for (const tile of deploy) {
    const found = hatchTiles(snapshot, tile, EVERYWHERE, PassMask.INFANTRY);
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}
