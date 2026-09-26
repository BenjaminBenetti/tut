import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { IMPASSABLE_GROUND_SURFACES } from "../../mapgen/data/surfaces";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { isBurrowed } from "../model/unit";
import { unitFootprintTiles } from "./footprint-service";
import type { MoveSearch, TileKey } from "./movement-service";
import { moveBudget, occupiedKeys, STEP_COST } from "./movement-service";

// ===========================================
// Types
// ===========================================

/** A ground tile a burrower can end a tunnel on this turn, and what getting there costs. */
export interface TunnelDestination {
  readonly tile: Tile;
  /** Movement points from where it is, one per column crossed. */
  readonly cost: number;
}

// ===========================================
// The rule
// ===========================================
//
// Under the ground there are no walls, doors, props, cover, storeys or
// slopes (#1179). A burrower travels along the **ground tile** of each
// column — the lowest tile in it, which is the earth a building stands
// on and the floor a hill rises to — and a step is one of the four
// orthogonal neighbours, costing `STEP_COST` whatever lies on top:
//
//   ┌───┬───┬───┐      B  burrower, under the ground
//   │ B │▓▓▓│   │      ▓  a wall, a crate, a squad: all overhead
//   ├───┼───┼───┤      ≈  water or bedrock: solid, or not earth at all
//   │   │ ≈ │ ★ │      ★  three steps away (around ≈), not two
//   └───┴───┴───┘
//
// Only the map's edge, empty columns and **impassable ground surfaces**
// (`IMPASSABLE_GROUND_SURFACES`: water and hive bedrock) stop it. The
// budget is the one walking has (`moveBudget`: action points × move), so
// it costs one action per `move` columns, exactly as a walk on open
// ground would. It is a plain breadth-first search: every step costs the
// same, so the first visit to a column is its cheapest, and neighbours
// are taken in `DIRECTIONS` order, so two runs agree.
//
// It passes under anyone — a squad, a spawner, another burrower — but
// never **ends** where another living unit or a live egg spawner holds
// the ground tile (`tunnelHeldKeys`).

// ===========================================
// Queries
// ===========================================

/**
 * The ground tile of the column at `(x, z)`: its lowest tile, or
 * undefined off the map or over a column with no tiles at all.
 *
 * @param index - The map's tile index.
 * @param x - Column x.
 * @param z - Column z.
 * @returns The tile a burrower under this column is on.
 */
export function groundTileAt(
  index: TileIndex,
  x: number,
  z: number,
): Tile | undefined {
  return index.column(x, z)[0];
}

/**
 * Whether a burrower can dig through this ground tile: anything but an
 * impassable ground surface.
 *
 * @param tile - A column's ground tile.
 * @returns False for water and bedrock.
 */
export function isDiggable(tile: Tile): boolean {
  return !IMPASSABLE_GROUND_SURFACES.has(tile.surface);
}

/**
 * Where a burrower tunnels to, by the rule above: every ground tile it
 * can reach within its move budget, with the cost of the cheapest way
 * there, starting from the ground tile of its own column at `0`. A unit
 * over no ground, or over ground it cannot dig, reaches nothing.
 *
 * Returns the same shape as `searchMoves`, so a path reads back through
 * `parents` in the same way.
 *
 * @param mission - The mission, or a side's view of it.
 * @param unit - The burrower.
 * @param index - The map's tile index; built when not given.
 * @returns Costs, tiles and predecessors keyed by tile key.
 */
export function searchTunnel(
  mission: TacticalState,
  unit: Unit,
  index: TileIndex = new TileIndex(mission.map),
): MoveSearch {
  const costs = new Map<TileKey, number>();
  const tiles = new Map<TileKey, Tile>();
  const parents = new Map<TileKey, TileKey>();
  const origin = groundTileAt(index, unit.pos.x, unit.pos.z);
  if (origin === undefined || !isDiggable(origin)) {
    return { costs, tiles, parents };
  }
  const budget = moveBudget(mission, unit);
  const originKey = index.keyOf(origin);
  costs.set(originKey, 0);
  tiles.set(originKey, origin);
  // for-of visits appended entries: a breadth-first sweep in step order.
  const frontier: Tile[] = [origin];
  for (const current of frontier) {
    const currentKey = index.keyOf(current);
    const cost = (costs.get(currentKey) ?? 0) + STEP_COST;
    if (cost > budget) {
      continue;
    }
    for (const direction of DIRECTIONS) {
      const at = stepGridPos(current, direction);
      const next = groundTileAt(index, at.x, at.z);
      if (next === undefined || !isDiggable(next)) {
        continue;
      }
      const key = index.keyOf(next);
      if (costs.has(key)) {
        continue;
      }
      costs.set(key, cost);
      tiles.set(key, next);
      parents.set(key, currentKey);
      frontier.push(next);
    }
  }
  return { costs, tiles, parents };
}

/**
 * Keys of the tiles a tunnel may not end on: every tile a living unit
 * other than `except` stands on, **burrowed or not** — two bugs never
 * share the earth under one tile, and a squad above is in the way of
 * coming up — plus every live egg spawner's tile.
 *
 * @param mission - The mission, or a side's view of it.
 * @param index - The map's tile index.
 * @param except - The burrower asking, which does not block itself.
 * @returns The held tile keys.
 */
export function tunnelHeldKeys(
  mission: TacticalState,
  index: TileIndex,
  except?: UnitId,
): ReadonlySet<TileKey> {
  const held = new Set<TileKey>(occupiedKeys(mission, index, except));
  for (const key of buriedKeys(mission, index, except)) {
    held.add(key);
  }
  for (const spawner of mission.spawners) {
    if (!spawner.destroyed && index.inBounds(spawner.pos)) {
      held.add(index.keyOf(spawner.pos));
    }
  }
  return held;
}

/**
 * Keys of the tiles living burrowed units are under, optionally leaving
 * one out. The complement of `occupiedKeys`, which skips them: what the
 * bugs' own placement rules consult so a hatchling never lands on top
 * of a burrower of its own brood.
 *
 * @param mission - The mission, or a side's view of it.
 * @param index - The map's tile index.
 * @param except - A unit to leave out.
 * @returns The keys under burrowed units.
 */
export function buriedKeys(
  mission: TacticalState,
  index: TileIndex,
  except?: UnitId,
): ReadonlySet<TileKey> {
  const keys = new Set<TileKey>();
  for (const unit of mission.units) {
    if (unit.hp <= 0 || unit.id === except || !isBurrowed(unit)) {
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
 * Every ground tile the burrower can end a tunnel on this turn: reached
 * by `searchTunnel`, not the column it is under, and not held
 * (`tunnelHeldKeys`). In search order.
 *
 * @param mission - The mission, or a side's view of it.
 * @param unit - The burrower.
 * @param index - The map's tile index; built when not given.
 * @returns Each destination with its cost.
 */
export function tunnelDestinations(
  mission: TacticalState,
  unit: Unit,
  index: TileIndex = new TileIndex(mission.map),
): TunnelDestination[] {
  const search = searchTunnel(mission, unit, index);
  const held = tunnelHeldKeys(mission, index, unit.id);
  const origin = groundTileAt(index, unit.pos.x, unit.pos.z);
  const originKey = origin === undefined ? undefined : index.keyOf(origin);
  const destinations: TunnelDestination[] = [];
  for (const [key, tile] of search.tiles) {
    if (key === originKey || held.has(key)) {
      continue;
    }
    destinations.push({ tile, cost: search.costs.get(key) ?? 0 });
  }
  return destinations;
}

/**
 * What tunnelling to `to` costs in movement points, or undefined when it
 * is not a destination this turn (`tunnelDestinations`).
 *
 * @param mission - The mission, or a side's view of it.
 * @param unit - The burrower.
 * @param to - The ground tile it wants to end on.
 * @param index - The map's tile index; built when not given.
 * @returns The cost, or undefined.
 */
export function tunnelCost(
  mission: TacticalState,
  unit: Unit,
  to: TileCoord,
  index: TileIndex = new TileIndex(mission.map),
): number | undefined {
  const tile = index.inBounds(to) ? index.getAt(to) : undefined;
  if (tile === undefined) {
    return undefined;
  }
  const key = index.keyOf(tile);
  return tunnelDestinations(mission, unit, index).find(
    (destination) => index.keyOf(destination.tile) === key,
  )?.cost;
}
