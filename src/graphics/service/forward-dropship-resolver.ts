import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import { STOREY_LAYERS } from "../../core/model/elevation";
import type { Rect } from "../../core/model/grid";
import { rectContains } from "../../core/service/grid-math";
import type { Hook } from "../../mapgen/model/hook";
import { allHooks } from "../../mapgen/model/hook";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import {
  dropshipClearanceFor,
  dropshipFootprint,
} from "../../mapgen/service/dropship-site-layout";
import { forwardExtractionHooks } from "../../mapgen/service/extraction-zones";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { DrawnDropship } from "../model/drawn-dropship";

// ===========================================
// Constants
// ===========================================

/**
 * How far, in columns along either axis, the ship's own boarding square
 * may sit from the point's while the scene looks for a berth: enough for
 * every berth within `FORWARD_DROPSHIP_GAP` of the point.
 */
export const FORWARD_DROPSHIP_REACH = 12;

/**
 * The most columns between the foot of the ramp and the point: at 0 the
 * ramp comes down on the point, at 1 beside it.
 */
export const FORWARD_DROPSHIP_GAP = 3;

/**
 * The most layers the ship may hold above the point's floor to clear
 * what is under it: a storey, the height of a chamber's clutter.
 */
export const FORWARD_DROPSHIP_MAX_LIFT = STOREY_LAYERS;

// ===========================================
// Types
// ===========================================

/** One way to set the ship near a point, and how well it sits. */
interface Berth {
  readonly facing: Direction;
  readonly footprint: Rect;
  /** The top tile of every hull column. */
  readonly hull: readonly TileCoord[];
  /** Layers above the point's floor the skids must sit: fewer is better. */
  readonly lift: number;
  /** Columns from the foot of the ramp to the point: fewer is better. */
  readonly gap: number;
  /** Bare floor in the margin around the ship: more is roomier. */
  readonly room: number;
}

/** A point and what a berth beside it must keep off. */
interface Site {
  /** The point's square. */
  readonly square: Rect;
  /** The point's floor level. */
  readonly level: number;
  /** The point's columns, by column key. */
  readonly point: ReadonlySet<number>;
  /** Every other hook's columns, by column key. */
  readonly others: ReadonlySet<number>;
}

// ===========================================
// Resolution
// ===========================================

/**
 * The drop ship the scene sets beside each forward extraction point
 * (#1179 C3a): the briefing says one holds there, so the board shows
 * it. The generator placed the point without an aircraft, so the ship is
 * fitted here from the landing zone's layout (`dropshipClearanceFor`),
 * with its ramp coming down on the point or near it.
 *
 * ```
 *   rock rock rock rock rock
 *   rock ┌─────┐ rock rock          hull: five by seven columns,
 *   ···· │ hull│ ········            none of it rock above the skids
 *   ···· └──┬──┘ ········
 *   ···· ┌──┴─┐  ········            ramp: its foot on the point
 *   ···· │ pt │  ········            (gap 0), or `gap` columns off
 *   ···· └────┘  ········
 * ```
 *
 * Scenery only: the map, its tiles and every rule stay as the generator
 * left them, so a unit may still walk the floor under the hull. The ship
 * never sits in rock: its skids go on the point's floor when every hull
 * column is bare floor there (landed, `lift` 0), and otherwise just
 * clear of the highest thing under the hull — a one-layer step, a slope,
 * a prop — up to `FORWARD_DROPSHIP_MAX_LIFT` layers, holding over it.
 * The hull never covers the point or any other hook's tile (a nest, a
 * brood's heart), and the foot of the ramp is never in rock.
 *
 * Of the berths whose ramp foot is within `FORWARD_DROPSHIP_GAP` of the
 * point, the lowest wins, then the nearest, then the roomiest, then the
 * first found (by facing in `DIRECTIONS`, then row, then column). A
 * point with no berth gets no ship; its blue tiles still mark it.
 *
 * @param map - The map, for its forward points and floor.
 * @param index - The map's tile index, when the caller has one.
 */
export function resolveForwardDropships(
  map: TacticalMap,
  index: TileIndex = new TileIndex(map),
): DrawnDropship[] {
  const forward = forwardExtractionHooks(map.hooks);
  const others = new Set(
    allHooks(map.hooks)
      .filter((hook) => !forward.includes(hook))
      .flatMap((hook) => hook.tiles.map((tile) => columnKey(map, tile))),
  );
  return forward.flatMap((hook) => {
    const first = hook.tiles[0];
    if (first === undefined) return [];
    const site = siteOf(map, hook, others);
    const berth = bestBerth(map, index, site);
    if (berth === undefined) return [];
    return [
      {
        footprint: berth.footprint,
        level: site.level,
        lift: berth.lift,
        facing: berth.facing,
        tile: first,
        occupiedTiles: [...hook.tiles, ...berth.hull],
      },
    ];
  });
}

// ===========================================
// Berths
// ===========================================

/** The point's square and level, and the columns a berth keeps off. */
function siteOf(
  map: TacticalMap,
  hook: Hook,
  others: ReadonlySet<number>,
): Site {
  const xs = hook.tiles.map((tile) => tile.x);
  const zs = hook.tiles.map((tile) => tile.z);
  const x = Math.min(...xs);
  const z = Math.min(...zs);
  return {
    square: { x, z, w: Math.max(...xs) - x + 1, d: Math.max(...zs) - z + 1 },
    level: hook.tiles[0]?.y ?? 0,
    point: new Set(hook.tiles.map((tile) => columnKey(map, tile))),
    others,
  };
}

/** The best berth near the site (see `resolveForwardDropships`), if any. */
function bestBerth(
  map: TacticalMap,
  index: TileIndex,
  site: Site,
): Berth | undefined {
  const reach = FORWARD_DROPSHIP_REACH;
  let best: Berth | undefined;
  for (const facing of DIRECTIONS) {
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const patch = { x: site.square.x + dx, z: site.square.z + dz };
        const berth = berthAt(map, index, site, patch, facing);
        if (berth !== undefined && better(berth, best)) best = berth;
      }
    }
  }
  return best;
}

/** Whether `berth` beats `best`: lower, then a nearer ramp, then roomier. */
function better(berth: Berth, best: Berth | undefined): boolean {
  if (best === undefined) return true;
  if (berth.lift !== best.lift) return berth.lift < best.lift;
  if (berth.gap !== best.gap) return berth.gap < best.gap;
  return berth.room > best.room;
}

/**
 * The berth whose own boarding square has its low corner at `patch`, or
 * undefined when the hull would cover the point or a hook, sit in rock
 * or lift past `FORWARD_DROPSHIP_MAX_LIFT`, or its ramp's foot would be
 * in rock or more than `FORWARD_DROPSHIP_GAP` from the point.
 */
function berthAt(
  map: TacticalMap,
  index: TileIndex,
  site: Site,
  patch: { x: number; z: number },
  facing: Direction,
): Berth | undefined {
  const clearance = dropshipClearanceFor(patch, facing);
  const footprint = dropshipFootprint(clearance, facing);
  const foot = rampFoot(footprint, facing);
  const gap = Math.min(...foot.map((column) => apart(column, site.square)));
  if (gap > FORWARD_DROPSHIP_GAP) return undefined;
  const hull: TileCoord[] = [];
  let lift = 0;
  for (let z = footprint.z; z < footprint.z + footprint.d; z++) {
    for (let x = footprint.x; x < footprint.x + footprint.w; x++) {
      const top = topTile(map, index, x, z);
      if (top === undefined || isHooked(map, site, x, z)) return undefined;
      const height = heightAbove(top, site.level);
      if (height === undefined || height > FORWARD_DROPSHIP_MAX_LIFT) {
        return undefined;
      }
      lift = Math.max(lift, height);
      hull.push({ x: top.x, y: top.y, z: top.z });
    }
  }
  if (!foot.every((column) => rampRests(map, index, site, column, lift))) {
    return undefined;
  }
  const room = roomAround(map, index, site, clearance, footprint);
  return { facing, footprint, hull, lift, gap, room };
}

/**
 * The row of columns just past the lowered ramp, the width of the hull:
 * where the ramp's foot rests.
 */
function rampFoot(
  footprint: Rect,
  facing: Direction,
): { x: number; z: number }[] {
  const count = facing === "n" || facing === "s" ? footprint.w : footprint.d;
  return Array.from({ length: count }, (_, i) => {
    switch (facing) {
      case "n":
        return { x: footprint.x + i, z: footprint.z + footprint.d };
      case "s":
        return { x: footprint.x + i, z: footprint.z - 1 };
      case "w":
        return { x: footprint.x + footprint.w, z: footprint.z + i };
      case "e":
        return { x: footprint.x - 1, z: footprint.z + i };
    }
  });
}

/** Chebyshev columns from `column` to the nearest column of `square`. */
function apart(column: { x: number; z: number }, square: Rect): number {
  const dx = Math.max(
    square.x - column.x,
    column.x - (square.x + square.w - 1),
    0,
  );
  const dz = Math.max(
    square.z - column.z,
    column.z - (square.z + square.d - 1),
    0,
  );
  return Math.max(dx, dz);
}

/**
 * Whether the ramp's foot may rest on the column: the point, or a
 * column no higher than the skids with nothing standing on it and no
 * other hook's tile.
 */
function rampRests(
  map: TacticalMap,
  index: TileIndex,
  site: Site,
  column: { x: number; z: number },
  lift: number,
): boolean {
  if (site.point.has(column.z * map.width + column.x)) return true;
  const top = topTile(map, index, column.x, column.z);
  if (top === undefined || isHooked(map, site, column.x, column.z)) {
    return false;
  }
  const height = heightAbove(top, site.level);
  return height !== undefined && height <= lift && top.propId === undefined;
}

/** Bare floor no higher than the point's in the clearance, outside the hull. */
function roomAround(
  map: TacticalMap,
  index: TileIndex,
  site: Site,
  clearance: Rect,
  footprint: Rect,
): number {
  let room = 0;
  for (let z = clearance.z; z < clearance.z + clearance.d; z++) {
    for (let x = clearance.x; x < clearance.x + clearance.w; x++) {
      if (rectContains(footprint, x, z) || isHooked(map, site, x, z)) {
        continue;
      }
      const top = topTile(map, index, x, z);
      if (top !== undefined && heightAbove(top, site.level) === 0) room++;
    }
  }
  return room;
}

// ===========================================
// Ground
// ===========================================

/** The column's highest tile, or undefined off the map or where it has none. */
function topTile(
  map: TacticalMap,
  index: TileIndex,
  x: number,
  z: number,
): Tile | undefined {
  if (x < 0 || z < 0 || x >= map.width || z >= map.depth) return undefined;
  const column = index.column(x, z);
  return column[column.length - 1];
}

/** Whether the column is the point's or another hook's. */
function isHooked(map: TacticalMap, site: Site, x: number, z: number): boolean {
  const key = z * map.width + x;
  return site.point.has(key) || site.others.has(key);
}

/**
 * Layers the top of `tile`, and whatever stands on it, rises above
 * `level` (none for lower ground): the tile's own level, plus one for a
 * slope rising to the next layer or a prop's or a wall's height (a
 * storey when the map records none). Undefined for a building's tile,
 * which no ship may cover.
 */
function heightAbove(tile: Tile, level: number): number | undefined {
  if (tile.buildingId !== undefined) return undefined;
  const slope = tile.slope === undefined ? 0 : 1;
  const standing =
    tile.propId !== undefined
      ? (tile.sightHeight ?? STOREY_LAYERS)
      : Object.keys(tile.walls).length > 0
        ? STOREY_LAYERS
        : 0;
  return Math.max(0, tile.y + Math.max(slope, standing) - level);
}

/** A column's key on `map`: `z × width + x`. */
function columnKey(map: TacticalMap, tile: Pick<TileCoord, "x" | "z">): number {
  return tile.z * map.width + tile.x;
}
