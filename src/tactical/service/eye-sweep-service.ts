import type { GridPos } from "../../core/model/grid";
import { manhattanDistance } from "../../core/service/grid-math";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import type { VisionTileKey } from "../model/tactical-state";
import { hasLineOfSight } from "./sight-service";

// ===========================================
// Constants
// ===========================================

/**
 * Sweeps kept per map before the memory is cleared and refilled. A
 * sweep is one eye's tile list, a few hundred numbers; a cavern with a
 * hundred bugs walking for fifty turns asks for a few thousand distinct
 * ones, so this bound is rarely reached and only caps a long session.
 */
const MAX_SWEEPS_PER_MAP = 20_000;

/** Sight ranges above this are swept without being remembered. */
const MAX_REMEMBERED_RANGE = 1_024;

// ===========================================
// Types
// ===========================================

/** One map's remembered sweeps, by `sweepKey`. */
type SweepMemory = Map<number, Int32Array>;

// ===========================================
// State
// ===========================================

/** Each tile index's remembered sweeps, for as long as the index lives. */
const SWEEPS = new WeakMap<TileIndex, SweepMemory>();

// ===========================================
// Reaching
// ===========================================

/**
 * Whether an eye at `eye` with `range` reaches `at` by the map alone:
 * inside the range by the map-plane metric, with a clear line. The part
 * of sight that only the ground decides; `vision-service`'s `eyeSees`
 * adds the one term that does not (smoke), so the two together are
 * still the one rule every sight question asks.
 *
 * @param map - The map, for `hasLineOfSight`.
 * @param eye - Where the eye stands.
 * @param range - Its sight range in tiles.
 * @param at - The tile looked at.
 * @param index - Tile index over `map`.
 * @returns True when range and line both allow it.
 */
export function eyeReaches(
  map: TacticalMap,
  eye: GridPos,
  range: number,
  at: GridPos,
  index: TileIndex,
): boolean {
  return (
    manhattanDistance(eye, at) <= range && hasLineOfSight(map, eye, at, index)
  );
}

// ===========================================
// Sweeping
// ===========================================

/**
 * The keys of every tile one eye reaches (`eyeReaches`), in the order
 * `computeVision` walks the eye's diamond: column by column, `dx` then
 * `dz` ascending, each column's tiles from the ground up (#1179).
 *
 * ```
 *   for dx in −range..range, dz in −span..span (span = range − |dx|):
 *     for tile of index.column(eye.x + dx, eye.z + dz):
 *       eyeReaches(eye, range, tile) ──► key
 * ```
 *
 * Remembered per tile index, by the eye's tile and range: the answer
 * depends on the ground and nothing else, and a map never changes once
 * built, so a bug that has not moved looks from the same tile at the
 * same tiles. That is what keeps the bug phase from re-tracing every
 * bug's sight lines each time one of them takes a step: before this,
 * vision after each bug's move re-traced all of them, and on a Great
 * Hive cavern with every brood awake it was a third of the phase.
 *
 * An eye off the grid or a fractional range is swept without being
 * remembered, since neither has a key; either way the answer is the
 * same list the walk produces.
 *
 * @param map - The map the eye looks over.
 * @param eye - The tile the eye stands on.
 * @param range - Its sight range in tiles.
 * @param index - Tile index over `map`.
 * @returns The keys of the tiles it reaches, in sweep order.
 */
export function eyeSweep(
  map: TacticalMap,
  eye: GridPos,
  range: number,
  index: TileIndex,
): Int32Array {
  const key = sweepKey(eye, range, index);
  if (key === undefined) {
    return sweep(map, eye, range, index);
  }
  let memory = SWEEPS.get(index);
  if (memory === undefined) {
    memory = new Map();
    SWEEPS.set(index, memory);
  }
  const known = memory.get(key);
  if (known !== undefined) {
    return known;
  }
  if (memory.size >= MAX_SWEEPS_PER_MAP) {
    memory.clear();
  }
  const swept = sweep(map, eye, range, index);
  memory.set(key, swept);
  return swept;
}

/**
 * The tile a vision key names on `index`'s grid: the inverse of
 * `TileIndex.keyOf`, `(y * depth + z) * width + x`.
 *
 * @param key - A key `index.keyOf` produced.
 * @param index - The index that produced it.
 * @returns The tile coordinate.
 */
export function tileOfKey(key: VisionTileKey, index: TileIndex): GridPos {
  const x = key % index.width;
  const rest = (key - x) / index.width;
  const z = rest % index.depth;
  const y = (rest - z) / index.depth;
  return { x, y, z };
}

// ===========================================
// Helpers
// ===========================================

/** The walk itself, uncached. */
function sweep(
  map: TacticalMap,
  eye: GridPos,
  range: number,
  index: TileIndex,
): Int32Array {
  const keys: number[] = [];
  for (let dx = -range; dx <= range; dx++) {
    const span = range - Math.abs(dx);
    for (let dz = -span; dz <= span; dz++) {
      for (const tile of index.column(eye.x + dx, eye.z + dz)) {
        if (eyeReaches(map, eye, range, tile, index)) {
          keys.push(index.keyOf(tile));
        }
      }
    }
  }
  return Int32Array.from(keys);
}

/**
 * The memory key for an eye and a range, or undefined when either has
 * none: an eye off the grid, or a range that is not a whole number of
 * tiles below `MAX_REMEMBERED_RANGE`.
 */
function sweepKey(
  eye: GridPos,
  range: number,
  index: TileIndex,
): number | undefined {
  if (
    !Number.isInteger(range) ||
    range < 0 ||
    range >= MAX_REMEMBERED_RANGE ||
    !index.inBounds(eye)
  ) {
    return undefined;
  }
  return index.keyOf(eye) * MAX_REMEMBERED_RANGE + range;
}
