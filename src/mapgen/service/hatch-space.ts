import type { UnitClass } from "../model/pass-mask";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import type { TacticalMap } from "../model/tactical-map";
import { ReachabilityService } from "./reachability-service";
import { TileIndex } from "./tile-index";

// ===========================================
// Types
// ===========================================

/** A frozen map indexed for traversal queries. */
export interface ReachabilitySnapshot {
  readonly index: TileIndex;
  readonly reach: ReachabilityService;
}

// ===========================================
// Hatch space
// ===========================================

/**
 * Builds the snapshot a frozen map needs for traversal queries: one
 * index and one reachability service, shared by every call.
 */
export function snapshotMap(map: TacticalMap): ReachabilitySnapshot {
  const index = new TileIndex(map);
  return { index, reach: new ReachabilityService(index, map.connectors) };
}

/**
 * The tiles the class can reach from `origin` (itself first, then in
 * order of discovery) without stepping further than `radius` columns
 * from it, under the §5 rule: where a spawner's hatchlings can stand.
 * Empty when the origin has no tile or the class cannot stand there.
 *
 * ```
 *   . # . . .      # wall  o counted  x beyond the radius
 *   o # o o x      radius 2 from S: 8 tiles, the wall keeps the
 *   o S o o x      far side out unless a door connects it
 *   o # o o x
 * ```
 */
export function hatchTiles(
  snapshot: ReachabilitySnapshot,
  origin: TileCoord,
  radius: number,
  unitClass: UnitClass,
): Tile[] {
  const { index, reach } = snapshot;
  const start = index.getAt(origin);
  if (start === undefined || (start.pass & unitClass) === 0) {
    return [];
  }
  const seen = new Set<number>([index.keyOf(start)]);
  const queue: Tile[] = [start];
  // Pushing while iterating is the queue: array iterators see appended tiles.
  for (const tile of queue) {
    for (const next of reach.neighbours(tile, unitClass)) {
      const key = index.keyOf(next);
      const spread = Math.abs(next.x - origin.x) + Math.abs(next.z - origin.z);
      if (seen.has(key) || spread > radius) {
        continue;
      }
      seen.add(key);
      queue.push(next);
    }
  }
  return queue;
}

/**
 * How many tiles `hatchTiles` finds: the room a spawner has to hatch
 * into. Zero when the origin has no tile or the class cannot stand there.
 */
export function hatchSpace(
  snapshot: ReachabilitySnapshot,
  origin: TileCoord,
  radius: number,
  unitClass: UnitClass,
): number {
  return hatchTiles(snapshot, origin, radius, unitClass).length;
}
