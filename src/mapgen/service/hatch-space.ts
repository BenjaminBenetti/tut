import type { UnitClass } from "../model/pass-mask";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import type { ReachabilityService } from "./reachability-service";
import type { TileIndex } from "./tile-index";

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
 * How many tiles the class can reach from `origin` (itself included)
 * without stepping further than `radius` columns from it, under the §5
 * rule: the room a spawner has to hatch into. Zero when the origin has
 * no tile or the class cannot stand there.
 *
 * ```
 *   . # . . .      # wall  o counted  x beyond the radius
 *   o # o o x      radius 2 from S: 8 tiles, the wall keeps the
 *   o S o o x      far side out unless a door connects it
 *   o # o o x
 * ```
 */
export function hatchSpace(
  snapshot: ReachabilitySnapshot,
  origin: TileCoord,
  radius: number,
  unitClass: UnitClass,
): number {
  const { index, reach } = snapshot;
  const start = index.getAt(origin);
  if (start === undefined || (start.pass & unitClass) === 0) {
    return 0;
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
  return seen.size;
}
