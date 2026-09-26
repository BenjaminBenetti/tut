import type { Rng } from "../../../core/model/rng";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Tile } from "../../../mapgen/model/tile";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { TileIndex } from "../../../mapgen/service/tile-index";
import type { TacticalState } from "../../model/tactical-state";
import { unitFootprintTiles } from "../footprint-service";

// ===========================================
// Distances
// ===========================================

/** Manhattan distance across the ground plane; levels do not count toward clearance. */
export function groundDistance(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/**
 * The ground distance from `tile` to the nearest of `points`, or
 * `Infinity` when there are none, so a clearance from nothing always
 * holds.
 */
export function nearestDistance(
  tile: TileCoord,
  points: readonly TileCoord[],
): number {
  let nearest = Infinity;
  for (const point of points) {
    nearest = Math.min(nearest, groundDistance(tile, point));
  }
  return nearest;
}

// ===========================================
// What the map holds
// ===========================================

/** Every deploy-zone tile, zone by zone in map order. */
export function deployTilesOf(map: TacticalMap): readonly TileCoord[] {
  return map.hooks.deployZones.flatMap((zone) => zone.tiles);
}

/**
 * Every tile a sitrep must keep its hazards off: each objective hook's
 * tiles (spawners, carcasses, generators, anything a type adds), the
 * extraction and edge-spawn hooks, live spawners and carcasses already
 * on the mission.
 */
export function missionPoints(mission: TacticalState): readonly TileCoord[] {
  const hooks = mission.map.hooks;
  return [
    ...hooks.objectives.flatMap((hook) => hook.tiles),
    ...hooks.extraction.tiles,
    ...hooks.edgeSpawns.flatMap((hook) => hook.tiles),
    ...mission.spawners
      .filter((spawner) => !spawner.destroyed && spawner.hp > 0)
      .map((spawner) => spawner.pos),
    ...mission.carcasses.map((carcass) => carcass.pos),
  ];
}

/** Keys of every tile a living unit stands on, block units' whole footprint included. */
export function heldKeys(
  mission: TacticalState,
  index: TileIndex,
): ReadonlySet<number> {
  const keys = new Set<number>();
  for (const unit of mission.units) {
    if (unit.hp <= 0) {
      continue;
    }
    for (const tile of unitFootprintTiles(mission, unit)) {
      if (index.inBounds(tile)) {
        keys.add(index.keyOf(tile));
      }
    }
  }
  return keys;
}

/**
 * Open ground, in map order: the lowest tile of its column, outside
 * every building, that something could stand on. Where a sitrep's
 * smoke and fire go, so none of it lands on a roof, inside a room or on
 * a tile nothing can enter (water, a car, rock).
 */
export function openGround(map: TacticalMap, index: TileIndex): Tile[] {
  return map.tiles.filter(
    (tile) =>
      tile.pass !== PassMask.NONE &&
      tile.buildingId === undefined &&
      index.column(tile.x, tile.z)[0] === tile,
  );
}

/**
 * The open-ground tile at `(x, z)` within `rise` levels of `from`, or
 * undefined: how a cloud or a blaze spreads from its centre without
 * climbing a cliff or entering a building.
 */
export function groundNear(
  x: number,
  z: number,
  from: TileCoord,
  rise: number,
  allowed: ReadonlySet<number>,
  index: TileIndex,
): Tile | undefined {
  const tile = index.column(x, z)[0];
  if (tile === undefined || Math.abs(tile.y - from.y) > rise) {
    return undefined;
  }
  return allowed.has(index.keyOf(tile)) ? tile : undefined;
}

// ===========================================
// Drawing sites
// ===========================================

/**
 * How many of something a map gets for its area: one per `tilesPer`
 * tiles of width × depth, rounded, then clamped to `[min, max]`.
 */
export function countForArea(
  map: Pick<TacticalMap, "width" | "depth">,
  tilesPer: number,
  min: number,
  max = Infinity,
): number {
  const count = Math.round((map.width * map.depth) / tilesPer);
  return Math.min(max, Math.max(min, count));
}

/**
 * Draws up to `count` sites from `candidates` uniformly at random,
 * keeping each only when it is at least `spacing` from every site
 * already kept and from every one of `existing`. A shuffle then a
 * greedy pass, as the garrison does, so the draw is one call on the rng
 * however many candidates there are, and none when there is nothing to
 * draw.
 *
 * @param candidates - Where a site may go, in map order.
 * @param count - The most sites to keep.
 * @param spacing - Least ground distance between any two sites.
 * @param rng - The stream the shuffle draws from.
 * @param existing - Sites already on the map that new ones keep clear of.
 * @returns The kept sites, in draw order.
 */
export function spreadSites<T extends TileCoord>(
  candidates: readonly T[],
  count: number,
  spacing: number,
  rng: Rng,
  existing: readonly TileCoord[] = [],
): T[] {
  const kept: T[] = [];
  if (count <= 0 || candidates.length === 0) {
    return kept;
  }
  for (const tile of rng.shuffle(candidates)) {
    if (kept.length >= count) {
      break;
    }
    if (
      nearestDistance(tile, kept) >= spacing &&
      nearestDistance(tile, existing) >= spacing
    ) {
      kept.push(tile);
    }
  }
  return kept;
}
