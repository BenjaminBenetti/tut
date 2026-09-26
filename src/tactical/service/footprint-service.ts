import { manhattanDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { SpawnerVariantCarrier } from "../model/spawner-variant";
import { spawnerTraitsOf } from "../model/spawner-variant";
import type { Spawner, TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";

// ===========================================
// Constants
// ===========================================

/** Tiles per side a unit stands on when its template declares no footprint. */
export const DEFAULT_FOOTPRINT = 1;

// ===========================================
// Footprint
// ===========================================

/**
 * The footprint a unit occupies on the ground plane (#1130): a square of
 * `size × size` tiles anchored at the unit's `pos`, which is the tile
 * with the lowest `x` and lowest `z`. Every tile shares the anchor's
 * level. A unit without a declared footprint stands on one tile, as
 * every unit did before the brute grew to four.
 *
 * ```
 *   size 2, anchored at A            index order: anchor first, then
 *                                    row-major — z outer, x inner
 *        A  1
 *        2  3
 * ```
 *
 * @param template - The template, or whatever of it carries `footprint`.
 * @returns Tiles per side; `1` when the template declares nothing.
 */
export function footprintSizeOf(
  template: Pick<UnitTemplate, "footprint">,
): number {
  const size = template.footprint;
  return size === undefined || size < 1 ? DEFAULT_FOOTPRINT : Math.floor(size);
}

/**
 * Every tile of a footprint of `size` anchored at `pos`: the anchor
 * first, then row-major with `z` as the outer loop and `x` as the inner,
 * all on the anchor's level. Stable order, so callers that draw from a
 * seed per tile agree between runs.
 *
 * @param pos - The anchor: lowest `x` and lowest `z` of the footprint.
 * @param size - Tiles per side; anything below one reads as one.
 * @returns The footprint's tiles, `size²` of them.
 */
export function footprintTiles(pos: TileCoord, size: number): TileCoord[] {
  const side = Math.max(1, Math.floor(size));
  const tiles: TileCoord[] = [];
  for (let dz = 0; dz < side; dz++) {
    for (let dx = 0; dx < side; dx++) {
      tiles.push({ x: pos.x + dx, y: pos.y, z: pos.z + dz });
    }
  }
  return tiles;
}

/**
 * The centre of a footprint in tile units on the ground plane: for a
 * single tile it is the tile's own centre at `+0.5`, for a 2×2 the
 * corner the four tiles meet at. Graphics stands the model here.
 *
 * @param pos - The anchor.
 * @param size - Tiles per side.
 * @returns The centre's `x` and `z` in tile units.
 */
export function footprintCentre(
  pos: TileCoord,
  size: number,
): { x: number; z: number } {
  const side = Math.max(1, Math.floor(size));
  return { x: pos.x + side / 2, z: pos.z + side / 2 };
}

/**
 * True when `tile` is one of the footprint's tiles: inside the square on
 * the ground plane and on the anchor's level.
 *
 * @param pos - The anchor.
 * @param size - Tiles per side.
 * @param tile - The tile asked about.
 * @returns Whether the footprint covers that tile.
 */
export function footprintContains(
  pos: TileCoord,
  size: number,
  tile: TileCoord,
): boolean {
  const side = Math.max(1, Math.floor(size));
  return (
    tile.y === pos.y &&
    tile.x >= pos.x &&
    tile.x < pos.x + side &&
    tile.z >= pos.z &&
    tile.z < pos.z + side
  );
}

// ===========================================
// Units in a mission
// ===========================================

/**
 * Tiles per side of the footprint `unit` stands on, read from its
 * template in the mission. A unit whose template is missing stands on
 * one tile rather than nowhere, so an unknown unit still blocks the
 * tile it is recorded on.
 *
 * @param mission - The mission the unit is in.
 * @param unit - The unit.
 * @returns Tiles per side, `1` or more.
 */
export function unitFootprintSize(mission: TacticalState, unit: Unit): number {
  return footprintSizeOf(mission.templates[unit.templateId] ?? {});
}

/**
 * Every tile `unit` stands on in the mission: its anchor for a
 * single-tile unit, the whole block for a brute. The one call for any
 * rule that asks "which tiles does this unit hold" — occupancy, blasts,
 * fires, spotting — so none of them re-derives the square.
 *
 * @param mission - The mission the unit is in.
 * @param unit - The unit.
 * @returns The tiles it holds, anchor first.
 */
export function unitFootprintTiles(
  mission: TacticalState,
  unit: Unit,
): TileCoord[] {
  return footprintTiles(unit.pos, unitFootprintSize(mission, unit));
}

// ===========================================
// Spawners
// ===========================================

/**
 * Tiles per side a spawner stands on, from its variant's traits: one for
 * a nest or a pod, three for the hive core. Anchored at `pos` the way a
 * unit's footprint is, so every footprint helper above serves it.
 *
 * @param spawner - Anything carrying the optional `variant` field.
 * @returns Tiles per side, `1` or more.
 */
export function spawnerFootprintSize(spawner: SpawnerVariantCarrier): number {
  return footprintSizeOf(spawnerTraitsOf(spawner));
}

/**
 * Every tile `spawner` stands on, anchor first. The one call for any
 * rule that asks "which tiles does this spawner hold" — occupancy,
 * blasts, fires, spotting, charges — so a 3×3 core is as hittable and as
 * solid on its far corner as on its anchor.
 *
 * @param spawner - The spawner.
 * @returns Its tiles: one for a nest or a pod, nine for the hive core.
 */
export function spawnerFootprintTiles(
  spawner: Pick<Spawner, "pos" | "variant">,
): TileCoord[] {
  return footprintTiles(spawner.pos, spawnerFootprintSize(spawner));
}

/**
 * True when `tile` is one of the tiles `spawner` stands on.
 *
 * @param spawner - The spawner.
 * @param tile - The tile asked about.
 * @returns Whether the spawner covers that tile.
 */
export function spawnerCovers(
  spawner: Pick<Spawner, "pos" | "variant">,
  tile: TileCoord,
): boolean {
  return footprintContains(spawner.pos, spawnerFootprintSize(spawner), tile);
}

/**
 * The tile of `spawner`'s footprint nearest `from`: `nearestFootprintTile`
 * over the spawner's own square. For a one-tile spawner it is `pos`.
 * Charges are planted against it, so reaching any face of the hive core
 * is reaching the core.
 *
 * @param spawner - The spawner.
 * @param from - Where the asker stands.
 * @returns The nearest footprint tile.
 */
export function nearestSpawnerTile(
  spawner: Pick<Spawner, "pos" | "variant">,
  from: TileCoord,
): TileCoord {
  return nearestFootprintTile(spawner.pos, spawnerFootprintSize(spawner), from);
}

/**
 * The tile of the footprint of `size` anchored at `pos` nearest `from`
 * by Manhattan distance on the ground plane, first in footprint order on
 * a tie. For a single tile it is `pos` itself.
 *
 * @param pos - The anchor.
 * @param size - Tiles per side.
 * @param from - Where the asker stands.
 * @returns The nearest footprint tile.
 */
export function nearestFootprintTile(
  pos: TileCoord,
  size: number,
  from: TileCoord,
): TileCoord {
  let best: TileCoord = pos;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tile of footprintTiles(pos, size)) {
    const distance = manhattanDistance(tile, from);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}
