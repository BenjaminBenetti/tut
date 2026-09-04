import { manhattanDistance } from "../../core/service/grid-math";
import { CoverLevel } from "../../mapgen/model/cover";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { UnitClass } from "../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { ReachabilityService } from "../../mapgen/service/reachability-service";
import { TileIndex } from "../../mapgen/service/tile-index";
import { UNIT_TUNING } from "../data/unit-tuning";
import type {
  DistanceRange,
  MapAssessment,
  ObjectiveApproach,
} from "../model/map-assessment";
import { coverAgainst, hasLineOfSight } from "./sight-service";

// ===========================================
// Types
// ===========================================

/** What the assessment measures firing positions and vision with. */
export interface AssessmentOptions {
  /** Weapon range a firing position must be inside. */
  readonly range: number;
  /** How far a standing unit sees, for the visibility sample. */
  readonly sightRange: number;
  /**
   * Standing positions sampled for `visibleShare`. Every open tile
   * against everything in range of it is millions of traces; thirty
   * positions is steady to a point or two.
   */
  readonly visionSamples: number;
}

// ===========================================
// Constants
// ===========================================

/** Range firing positions are counted at when the caller says nothing. */
export const DEFAULT_ASSESSMENT_OPTIONS: AssessmentOptions = {
  range: UNIT_TUNING.infantry.weapon.range,
  sightRange: UNIT_TUNING.infantry.sightRange,
  visionSamples: 30,
};

/** Empty range, for a map with nothing of that kind to walk to. */
const NO_DISTANCE: DistanceRange = { nearest: -1, farthest: -1 };

// ===========================================
// Assessment
// ===========================================

/**
 * Measures how a map plays for the squad that lands on it (#448). Pure
 * and mission-free: everything comes from the map's own hooks and the
 * rules in `sight-service` and `ReachabilityService`, so the preview can
 * show it for any generated map and a tuning change reads as a delta.
 *
 * ```
 *   deploy zones ──BFS per class──► steps to every reachable tile
 *        │                            │
 *        │                            ├─► approach / edge-spawn distances
 *        │                            └─► reach shares, high ground
 *        ▼
 *   per objective: tiles in range ∩ reachable ∩ line of sight
 *                  ──► firing positions, and how many are in cover
 * ```
 *
 * Costs one BFS per class plus one line-of-sight trace per tile near an
 * objective, so it is cheap enough to run per generated map in the
 * preview and far too slow to run per frame.
 */
export function assessMap(
  map: TacticalMap,
  options: AssessmentOptions = DEFAULT_ASSESSMENT_OPTIONS,
): MapAssessment {
  const index = new TileIndex(map);
  const reach = new ReachabilityService(index, map.connectors);
  const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
  const steps = walkFrom(index, reach, deploy, PassMask.INFANTRY);
  // The walk already visited every infantry-reachable tile, so its keys
  // are the reachable set; only the mech's costs a second search.
  const infantry: ReadonlySet<number> = new Set(steps.keys());
  const mech = reach.reachableFrom(deploy, PassMask.MECH);
  const firing = map.hooks.objectives.map((objective) =>
    firingPositionsFor(map, index, infantry, objective.tiles[0], options),
  );

  return {
    approachSteps: rangeOf(
      map.hooks.objectives.map((hook) => nearestStep(index, steps, hook.tiles)),
    ),
    edgeSpawnSteps: rangeOf(
      map.hooks.edgeSpawns.map((hook) => nearestStep(index, steps, hook.tiles)),
    ),
    firingPositionsMin:
      firing.length === 0 ? 0 : Math.min(...firing.map((f) => f.total)),
    firingPositionsMean: mean(firing.map((f) => f.total)),
    coveredFiringShare: mean(
      firing.map((f) => (f.total === 0 ? 0 : f.covered / f.total)),
    ),
    elevatedFiringShare: mean(
      firing.map((f) => (f.total === 0 ? 0 : f.elevated / f.total)),
    ),
    ...visibility(map, index, infantry, options),
    mechReachShare: infantry.size === 0 ? 0 : mech.size / infantry.size,
    infantryLevelSpan: levelSpan(map, index, infantry),
    mechLevelSpan: levelSpan(map, index, mech),
  };
}

// ===========================================
// Objective approach
// ===========================================

/**
 * Per objective, how each class gets at it (#345): the walk onto the
 * tile, and the shorter walk to somewhere it can be shot from.
 *
 * Written for the invariant that a mission is winnable at all. A mech
 * has no route onto an objective that sits indoors, so `mechSteps` is
 * routinely `-1` and that is by design; what must hold on every shipped
 * map is that *some* class can both reach a firing position and, for the
 * charge route, stand on the tile. See `ObjectiveApproach`.
 *
 * Costs one BFS per class plus a sight trace per tile near each
 * objective — the same order as `assessMap`, which it deliberately does
 * not fold into, so the cheap summary stays cheap.
 */
export function objectiveApproach(
  map: TacticalMap,
): readonly ObjectiveApproach[] {
  const index = new TileIndex(map);
  const reach = new ReachabilityService(index, map.connectors);
  const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
  const infantry = walkFrom(index, reach, deploy, PassMask.INFANTRY);
  const mech = walkFrom(index, reach, deploy, PassMask.MECH);
  return map.hooks.objectives.map((hook, objective) => {
    const origin = hook.tiles[0];
    return {
      objective,
      infantrySteps: nearestStep(index, infantry, hook.tiles),
      mechSteps: nearestStep(index, mech, hook.tiles),
      infantryFiringSteps:
        origin === undefined
          ? -1
          : stepsToFiringPosition(
              map,
              index,
              infantry,
              origin,
              UNIT_TUNING.infantry.weapon.range,
            ),
      mechFiringSteps:
        origin === undefined
          ? -1
          : stepsToFiringPosition(
              map,
              index,
              mech,
              origin,
              UNIT_TUNING.mech.weapon.range,
            ),
    };
  });
}

/**
 * Fewest steps to a tile the class can stand on, from which `origin` is
 * inside `range` and in sight. `-1` when it can never be shot at.
 */
function stepsToFiringPosition(
  map: TacticalMap,
  index: TileIndex,
  steps: ReadonlyMap<number, number>,
  origin: TileCoord,
  range: number,
): number {
  let best = -1;
  for (const tile of tilesWithin(index, origin, range)) {
    const at = steps.get(index.keyOf(tile));
    if (at === undefined || (best >= 0 && at >= best)) {
      continue;
    }
    if (manhattanDistance(tile, origin) > range) {
      continue;
    }
    if (!hasLineOfSight(map, tile, origin, index)) {
      continue;
    }
    best = at;
  }
  return best;
}

// ===========================================
// Firing positions
// ===========================================

/**
 * Firing positions found for one objective, and how many of them hold
 * cover against it or stand above it.
 */
interface FiringPositions {
  readonly total: number;
  readonly covered: number;
  readonly elevated: number;
}

/**
 * Tiles a squad can shoot the objective from: reachable from deploy,
 * within `range` in the same metric the hit chance uses (manhattan), and
 * with the sight line clear. `covered` counts the ones that have cover
 * against that objective and `elevated` the ones that look down on it —
 * the two terms the hit chance adds for a unit trading fire with a
 * hatching spawner.
 */
function firingPositionsFor(
  map: TacticalMap,
  index: TileIndex,
  reachable: ReadonlySet<number>,
  origin: TileCoord | undefined,
  options: AssessmentOptions,
): FiringPositions {
  if (origin === undefined) {
    return { total: 0, covered: 0, elevated: 0 };
  }
  let total = 0;
  let covered = 0;
  let elevated = 0;
  for (const tile of tilesWithin(index, origin, options.range)) {
    if (!reachable.has(index.keyOf(tile))) {
      continue;
    }
    if (manhattanDistance(tile, origin) > options.range) {
      continue;
    }
    if (!hasLineOfSight(map, tile, origin, index)) {
      continue;
    }
    total++;
    if (coverAgainst(map, tile, origin, index) !== CoverLevel.NONE) {
      covered++;
    }
    if (tile.y > origin.y) {
      elevated++;
    }
  }
  return { total, covered, elevated };
}

/** Every tile in the columns within `radius` manhattan of the origin. */
function tilesWithin(
  index: TileIndex,
  origin: TileCoord,
  radius: number,
): Tile[] {
  const tiles: Tile[] = [];
  for (let x = origin.x - radius; x <= origin.x + radius; x++) {
    const spread = radius - Math.abs(x - origin.x);
    for (let z = origin.z - spread; z <= origin.z + spread; z++) {
      tiles.push(...index.column(x, z));
    }
  }
  return tiles;
}

// ===========================================
// Distances
// ===========================================

/**
 * Steps from the origins to every tile the class can reach, by tile key.
 * A breadth-first search over the same neighbour rule movement uses, so
 * the numbers are what a unit walks rather than a straight line.
 */
function walkFrom(
  index: TileIndex,
  reach: ReachabilityService,
  origins: readonly TileCoord[],
  unitClass: UnitClass,
): ReadonlyMap<number, number> {
  const steps = new Map<number, number>();
  const frontier: Tile[] = [];
  for (const origin of origins) {
    const tile = index.getAt(origin);
    if (tile === undefined) {
      continue;
    }
    const key = index.keyOf(tile);
    if (!steps.has(key)) {
      steps.set(key, 0);
      frontier.push(tile);
    }
  }
  // for-of sees elements pushed during iteration, so this is a BFS queue.
  for (const current of frontier) {
    const distance = steps.get(index.keyOf(current)) ?? 0;
    for (const next of reach.neighbours(current, unitClass)) {
      const key = index.keyOf(next);
      if (!steps.has(key)) {
        steps.set(key, distance + 1);
        frontier.push(next);
      }
    }
  }
  return steps;
}

/** Fewest steps to any of the tiles, or `-1` when none is reachable. */
function nearestStep(
  index: TileIndex,
  steps: ReadonlyMap<number, number>,
  tiles: readonly TileCoord[],
): number {
  const found = tiles
    .map((coord) => index.getAt(coord))
    .map((tile) =>
      tile === undefined ? undefined : steps.get(index.keyOf(tile)),
    )
    .filter((step): step is number => step !== undefined);
  return found.length === 0 ? -1 : Math.min(...found);
}

/** Nearest and farthest of the distances, ignoring unreachable ones. */
function rangeOf(distances: readonly number[]): DistanceRange {
  const found = distances.filter((distance) => distance >= 0);
  if (found.length === 0) {
    return NO_DISTANCE;
  }
  return { nearest: Math.min(...found), farthest: Math.max(...found) };
}

// ===========================================
// Visibility
// ===========================================

/**
 * How much of what is in range a unit can actually see, and how much of
 * the map the deploy zones see before anyone moves (#596). This is what
 * fog of war hides, and it comes from the map: what stands on the ground
 * and how the ground is shaped.
 *
 * ```
 *   sample standing positions ──► tiles within sightRange
 *                                 with a clear line ──► visibleShare
 *   every deploy tile ──► union of what they see ──► deployVisibleShare
 * ```
 *
 * Sampled, not exhaustive: the samples are spread evenly through the
 * reachable tiles in map order, so the number is deterministic.
 */
function visibility(
  map: TacticalMap,
  index: TileIndex,
  reachable: ReadonlySet<number>,
  options: AssessmentOptions,
): { visibleShare: number; deployVisibleShare: number } {
  const open = map.tiles.filter((tile) => reachable.has(index.keyOf(tile)));
  if (open.length === 0 || map.tiles.length === 0) {
    return { visibleShare: 0, deployVisibleShare: 0 };
  }
  const step = Math.max(1, Math.floor(open.length / options.visionSamples));
  let seen = 0;
  let inRange = 0;
  for (let i = 0; i < open.length; i += step) {
    const from = open[i];
    if (from === undefined) {
      continue;
    }
    for (const tile of tilesWithin(index, from, options.sightRange)) {
      if (manhattanDistance(tile, from) > options.sightRange) {
        continue;
      }
      inRange++;
      if (hasLineOfSight(map, from, tile, index)) {
        seen++;
      }
    }
  }

  const known = new Set<number>();
  for (const coord of map.hooks.deployZones.flatMap((zone) => zone.tiles)) {
    for (const tile of tilesWithin(index, coord, options.sightRange)) {
      if (manhattanDistance(tile, coord) > options.sightRange) {
        continue;
      }
      if (hasLineOfSight(map, coord, tile, index)) {
        known.add(index.keyOf(tile));
      }
    }
  }

  return {
    visibleShare: inRange === 0 ? 0 : seen / inRange,
    deployVisibleShare: known.size / map.tiles.length,
  };
}

// ===========================================
// Elevation
// ===========================================

/**
 * How many distinct levels the class can reach from the deploy zones.
 * Counting levels rather than measuring against a baseline keeps the
 * read-out stable: a map whose ground happens to be split evenly between
 * two levels reports two either way, where a share would swing on which
 * half is larger.
 */
function levelSpan(
  map: TacticalMap,
  index: TileIndex,
  reachable: ReadonlySet<number>,
): number {
  const levels = new Set<number>();
  for (const tile of map.tiles) {
    if (reachable.has(index.keyOf(tile))) {
      levels.add(tile.y);
    }
  }
  return levels.size;
}

/** Mean of the values, or 0 when there are none. */
function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
