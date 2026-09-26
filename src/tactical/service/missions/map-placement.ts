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
