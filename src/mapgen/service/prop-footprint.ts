import type { Prop, PropDefinition, Rotation } from "../model/prop";
import type { TileCoord } from "../model/tile-coord";

/** Saved records without a footprint preserve their original one-tile occupancy. */
export function propTiles(prop: Prop): readonly TileCoord[] {
  return prop.occupiedTiles ?? [prop.tile];
}

/** A footprint is finite, connected, level, duplicate-free and contains its anchor. */
export function isValidPropFootprint(
  anchor: TileCoord,
  tiles: readonly TileCoord[],
): boolean {
  if (
    tiles.length === 0 ||
    tiles.some(
      (tile) =>
        !Number.isInteger(tile.x) ||
        !Number.isInteger(tile.y) ||
        !Number.isInteger(tile.z) ||
        tile.y !== anchor.y,
    )
  )
    return false;
  const key = (tile: TileCoord): string => `${tile.x},${tile.z}`;
  const remaining = new Set(tiles.map(key));
  if (remaining.size !== tiles.length || !remaining.delete(key(anchor)))
    return false;
  const queue = [anchor];
  for (const tile of queue)
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: tile.x + dx, y: tile.y, z: tile.z + dz };
      if (remaining.delete(key(next))) queue.push(next);
    }
  return remaining.size === 0;
}

/** Axis-aligned footprint anchored at its minimum X/Z corner; odd turns swap axes. */
export function propPlacementTiles(
  tile: TileCoord,
  definition: PropDefinition,
  rotation: Rotation,
): readonly TileCoord[] {
  const footprint = definition.footprint ?? { w: 1, d: 1 };
  const width = rotation % 2 === 0 ? footprint.w : footprint.d;
  const depth = rotation % 2 === 0 ? footprint.d : footprint.w;
  const tiles: TileCoord[] = [];
  for (let z = tile.z; z < tile.z + depth; z++)
    for (let x = tile.x; x < tile.x + width; x++)
      tiles.push({ x, y: tile.y, z });
  return tiles;
}

/** Bounds shared by presentation and placement diagnostics. */
export function propBounds(prop: Prop): {
  x: number;
  z: number;
  w: number;
  d: number;
} {
  const tiles = propTiles(prop);
  const x = Math.min(...tiles.map((tile) => tile.x));
  const z = Math.min(...tiles.map((tile) => tile.z));
  return {
    x,
    z,
    w: Math.max(...tiles.map((tile) => tile.x)) - x + 1,
    d: Math.max(...tiles.map((tile) => tile.z)) - z + 1,
  };
}
