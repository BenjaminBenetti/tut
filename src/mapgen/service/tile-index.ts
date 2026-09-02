import type { Direction } from "../../core/model/direction";
import { gridKey, isInBounds, stepGridPos } from "../../core/service/grid-math";
import type { TileGridSource } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";

// ===========================================
// TileIndex
// ===========================================

/**
 * Read-only spatial index over a map's sparse tile list (ADR 0004 §4.2).
 * Gives O(1) lookup by coordinate, per-column lists sorted by level, and
 * same-level neighbour access. Consumers keep the plain `TacticalMap` as
 * the source of truth and build one of these when they need fast paths.
 *
 * ```
 *   tiles[] ──► byKey:    gridKey(x,y,z) → Tile
 *           └─► byColumn: z*width+x     → [Tile @ y0, Tile @ y1, …]
 * ```
 *
 * Construction throws on an out-of-bounds or duplicate tile (invariant
 * I1); the validator pre-scans for those so it can report them instead.
 */
export class TileIndex {
  // ===========================================
  // Fields
  // ===========================================

  readonly width: number;
  readonly depth: number;
  readonly levels: number;
  private readonly byKey: ReadonlyMap<number, Tile>;
  private readonly byColumn: ReadonlyMap<number, readonly Tile[]>;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Indexes every tile of the source. Throws if a tile lies outside
   * `width × depth × levels` or two tiles share a coordinate.
   */
  constructor(source: TileGridSource) {
    this.width = source.width;
    this.depth = source.depth;
    this.levels = source.levels;

    const byKey = new Map<number, Tile>();
    const byColumn = new Map<number, Tile[]>();
    for (const tile of source.tiles) {
      if (!this.inBounds(tile)) {
        throw new Error(
          `Tile (${tile.x}, ${tile.y}, ${tile.z}) is outside ` +
            `${this.width}×${this.depth}×${this.levels}`,
        );
      }
      const key = this.keyOf(tile);
      if (byKey.has(key)) {
        throw new Error(`Duplicate tile at (${tile.x}, ${tile.y}, ${tile.z})`);
      }
      byKey.set(key, tile);

      const columnKey = this.columnKeyOf(tile.x, tile.z);
      const column = byColumn.get(columnKey);
      if (column === undefined) {
        byColumn.set(columnKey, [tile]);
      } else {
        column.push(tile);
      }
    }
    for (const column of byColumn.values()) {
      column.sort((a, b) => a.y - b.y);
    }

    this.byKey = byKey;
    this.byColumn = byColumn;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Number of indexed tiles. */
  get size(): number {
    return this.byKey.size;
  }

  /** True when the coordinate lies inside `width × depth × levels`. */
  inBounds(coord: TileCoord): boolean {
    return isInBounds(coord, this.width, this.depth) && coord.y < this.levels;
  }

  /**
   * Packs an in-bounds coordinate into the map's integer tile key
   * (`(y * depth + z) * width + x`). Throws when out of bounds.
   */
  keyOf(coord: TileCoord): number {
    return gridKey(coord, this.width, this.depth);
  }

  /** Returns the tile at the coordinate, or `undefined` (including off-map). */
  get(x: number, y: number, z: number): Tile | undefined {
    return this.getAt({ x, y, z });
  }

  /** Returns the tile at the coordinate, or `undefined` (including off-map). */
  getAt(coord: TileCoord): Tile | undefined {
    if (!this.inBounds(coord)) {
      return undefined;
    }
    return this.byKey.get(this.keyOf(coord));
  }

  /** True when a tile exists at the coordinate. */
  has(coord: TileCoord): boolean {
    return this.getAt(coord) !== undefined;
  }

  /**
   * Returns every tile in the column `(x, z)` in ascending level order, or
   * an empty list (also for off-map columns, which must never alias an
   * on-map one). Ground is the lowest entry; building floors and the roof
   * follow.
   */
  column(x: number, z: number): readonly Tile[] {
    if (!isInBounds({ x, y: 0, z }, this.width, this.depth)) {
      return EMPTY_COLUMN;
    }
    return this.byColumn.get(this.columnKeyOf(x, z)) ?? EMPTY_COLUMN;
  }

  /**
   * Returns the tile one step in the direction on the same level, or
   * `undefined` when there is none or the step leaves the map.
   */
  neighbour(from: TileCoord, direction: Direction): Tile | undefined {
    return this.getAt(stepGridPos(from, direction));
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Packs a column into a single integer key. */
  private columnKeyOf(x: number, z: number): number {
    return z * this.width + x;
  }
}

const EMPTY_COLUMN: readonly Tile[] = Object.freeze([]);
