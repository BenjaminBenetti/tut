import type { Direction } from "../../../core/model/direction";
import type { Hook } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { DEFAULT_HATCH_RADIUS } from "../../model/tactical-state";

// ===========================================
// Map placement
// ===========================================

// Where things stand on a freshly generated map: the reads the mission
// start and every mission type's setup rule share, so a deploy zone, a
// spawner and a generator are stood up the same way.

/**
 * The hook's first tile; hooks always carry at least one.
 *
 * @throws {Error} for a hook with no tiles, which ADR 0004 rules out.
 */
export function firstTile(hook: Hook): TileCoord {
  const tile = hook.tiles[0];
  if (tile === undefined) {
    throw new Error(`Hook "${hook.id}" has no tiles`);
  }
  return tile;
}

/** A plain `{ x, y, z }` copy, so a `Tile` never leaks its other fields into a unit. */
export function coordOf(coord: TileCoord): TileCoord {
  return { x: coord.x, y: coord.y, z: coord.z };
}

/**
 * The direction from `from` toward the map's centre along the dominant
 * axis, so whatever stands there starts facing the field. East when
 * there is no tile at all (a deploy zone of a map that failed I6, which
 * the generator never emits).
 */
export function facingToward(
  from: TileCoord | undefined,
  map: TacticalMap,
): Direction {
  if (from === undefined) {
    return "e";
  }
  const dx = map.width / 2 - from.x;
  const dz = map.depth / 2 - from.z;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx >= 0 ? "e" : "w";
  }
  return dz >= 0 ? "s" : "n";
}

/**
 * The hook's hatch radius, or the default when the meta is missing or
 * not a positive number: where a spawner's hatchlings, or a pod's
 * burst, may land.
 */
export function hatchRadiusOf(hook: Hook): number {
  const radius = hook.meta?.hatchRadius;
  return typeof radius === "number" && radius > 0
    ? radius
    : DEFAULT_HATCH_RADIUS;
}

/**
 * The tile nearest the footprint's centre: the middle of a 3 × 3
 * square, the first of the middle four of an even one, in hook order.
 * `first` is the hook's first tile, the answer for a one-tile footprint.
 * Where a wide prop (a wreck, a tunnel mouth) is drawn and marked.
 *
 * @param tiles - The footprint's tiles, in hook order.
 * @param first - The hook's first tile.
 */
export function middleOf(
  tiles: readonly TileCoord[],
  first: TileCoord,
): TileCoord {
  const cx = tiles.reduce((sum, tile) => sum + tile.x, 0) / tiles.length;
  const cz = tiles.reduce((sum, tile) => sum + tile.z, 0) / tiles.length;
  let best = first;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tile of tiles) {
    const distance = Math.abs(tile.x - cx) + Math.abs(tile.z - cz);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}
