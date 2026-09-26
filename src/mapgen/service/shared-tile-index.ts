import type { TileGridSource } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import { TileIndex } from "./tile-index";

// ===========================================
// Types
// ===========================================

/** A built index and what it was built from, to tell a stale one. */
interface IndexedGrid {
  readonly tiles: readonly Tile[];
  readonly count: number;
  readonly index: TileIndex;
}

// ===========================================
// Constants
// ===========================================

/** Each grid's index, for as long as the grid itself is reachable. */
const INDEXES = new WeakMap<TileGridSource, IndexedGrid>();

// ===========================================
// Shared index
// ===========================================

/**
 * The `TileIndex` over `source`, built the first time any rule asks for
 * it and shared by every rule after (#1179). Indexing a 72×184 cavern
 * costs a few milliseconds, and the tactical rules used to pay it at
 * every call: once per overwatch check on every step a bug took, once
 * per shot a behaviour priced, once per vision recompute. Sharing the
 * index is safe because it is read-only and a map never changes once
 * built (ADR 0003 §2.2: nothing mutates its input); a rule that changes
 * the ground returns a new map, and the new map gets its own index.
 *
 * ```
 *   tileIndexOf(map) ──► seen this map, same tile list? ──► the index built then
 *                    └─► otherwise ──► new TileIndex(map), kept beside the map
 * ```
 *
 * The tile list is checked by identity and length on every call, so a
 * grid assembled in place — a generator's draft, which should build its
 * own `new TileIndex` — gets a fresh index rather than a stale one.
 * Construction errors (an out-of-bounds or duplicate tile) are thrown
 * exactly as `new TileIndex` throws them, and nothing is kept.
 *
 * @param source - A finished grid: a `TacticalMap`, or its tile fields.
 * @returns The index over it.
 */
export function tileIndexOf(source: TileGridSource): TileIndex {
  const known = INDEXES.get(source);
  if (
    known?.tiles === source.tiles &&
    known.count === source.tiles.length &&
    known.index.width === source.width &&
    known.index.depth === source.depth &&
    known.index.levels === source.levels
  ) {
    return known.index;
  }
  const index = new TileIndex(source);
  INDEXES.set(source, {
    tiles: source.tiles,
    count: source.tiles.length,
    index,
  });
  return index;
}
