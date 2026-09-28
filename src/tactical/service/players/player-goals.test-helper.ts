import { manhattanDistance } from "../../../core/service/grid-math";
import { PassMask, allows } from "../../../mapgen/model/pass-mask";
import type { Tile } from "../../../mapgen/model/tile";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { onForwardExtraction } from "../../../mapgen/service/extraction-zones";
import type { EquipmentCatalogue } from "../../model/equipment";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Unit } from "../../model/unit";
import { passMaskFor } from "../../model/unit";
import { hasLineOfSight } from "../sight-service";
import { sightRangeOf } from "../vision-service";
import { distanceField } from "./player-navigation.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// Where to go when the HUD says nothing (#1179)
// ===========================================
//
// Some objectives hide their target until it is found — the hive core
// at the back of its cavern, a lurker in ambush — and a defence can
// leave a straggler out of sight. These are the places a player heads
// for then, read only from what the screen shows: the ground not yet
// explored, the back of the map as seen from the drop ship, and where
// a bug was last seen. And the places a player keeps out of: the
// footprint of a charge about to blow, drawn on the ground by the HUD.
//
//   frontier     unexplored tiles next to explored ground
//   backOfMap    the walkable ground farthest from where the force landed
//   lastContacts where the bugs out of sight now were last seen
//   lastSighted  those of them still out of sight: the live leads
//   sweep        walkable ground out of sight now, nearest first
//   vantagePoints  where to stand to see a goal no walk gets closer to
//   dangerKeys   tiles inside a burning charge's blast

// ===========================================
// Exploration
// ===========================================

/** Frontier tiles kept at most, nearest the force first. */
const FRONTIER_LIMIT = 64;

/**
 * Walkable ground the side has not explored that borders ground it has:
 * where a player walks to see more. Nearest `near` first (the force's
 * first unit unless told otherwise), at most `FRONTIER_LIMIT` of them,
 * so the field built on them stays cheap.
 */
export function frontier(
  view: PlayerView,
  near: readonly TileCoord[] = anchorOf(view),
): readonly TileCoord[] {
  const index = view.graph.index;
  const found: Tile[] = [];
  for (const tile of view.mission.map.tiles) {
    if (
      !allows(tile.pass, PassMask.INFANTRY) ||
      view.explored.has(index.keyOf(tile))
    ) {
      continue;
    }
    const bordering = (["n", "e", "s", "w"] as const).some((direction) => {
      const next = index.neighbour(tile, direction);
      return next !== undefined && view.explored.has(index.keyOf(next));
    });
    if (bordering) {
      found.push(tile);
    }
  }
  return nearestFirst(found, near, FRONTIER_LIMIT);
}

/** The back of each map, found once. */
const BACKS = new WeakMap<TacticalMap, readonly TileCoord[]>();

/**
 * The walkable ground farthest (in steps) from the drop ship: where a
 * briefing's "at the back of the cavern" sends a player. The 16 tiles
 * farthest of those within a tenth of the farthest distance, farthest
 * first: on a hive cavern that is where the burrows leave the core
 * chamber, not a side tunnel's dead end that happens to come first in
 * the map's tile order (#1179 C3a: on two Great Hive seeds of eight
 * both players searched the wrong tunnel to the cap). Measured from the
 * landing zone alone: a Great Hive's forward extraction point past
 * halfway is somewhere to board, not where the force set down, and measured
 * from both the back is whatever lies farthest from the pair of them.
 */
export function backOfMap(view: PlayerView): readonly TileCoord[] {
  const cached = BACKS.get(view.mission.map);
  if (cached !== undefined) {
    return cached;
  }
  const field = distanceField(
    view.graph,
    landingTiles(view),
    PassMask.INFANTRY,
  );
  let farthest = 0;
  for (const distance of field.values()) {
    farthest = Math.max(farthest, distance);
  }
  const floor = Math.floor(farthest * 0.9);
  const far: { tile: TileCoord; distance: number }[] = [];
  for (const tile of view.mission.map.tiles) {
    const distance = field.get(view.graph.index.keyOf(tile));
    if (distance !== undefined && distance >= floor) {
      far.push({ tile: { x: tile.x, y: tile.y, z: tile.z }, distance });
    }
  }
  const back = far
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 16)
    .map((entry) => entry.tile);
  BACKS.set(view.mission.map, back);
  return back;
}

/**
 * The extraction tiles where the force landed: the mission's, less any
 * forward extraction point's (#1179 C3a round 3). On a map with no
 * forward point, all of them.
 */
function landingTiles(view: PlayerView): readonly TileCoord[] {
  return view.mission.extraction.filter(
    (tile) => !onForwardExtraction(view.mission.map.hooks, tile),
  );
}

/**
 * Where spotted bugs were last seen, for those out of sight now and
 * still counted among the living: what a player chasing a straggler
 * reads off the last contact. A tile in sight with nobody on it is not
 * a lead, so it is dropped.
 */
export function lastSighted(view: PlayerView): readonly TileCoord[] {
  const visible = new Set(view.mission.vision.tdf?.visible ?? []);
  return lastContacts(view).filter(
    (seen) => !visible.has(view.graph.index.keyOf(seen)),
  );
}

/**
 * Where each bug out of sight now and still counted among the living
 * was last seen, whether or not that tile is in sight: the leads gone
 * cold as well as the live ones. A straggler that slipped away from its
 * last contact is most likely near it, so this is where a search starts.
 */
export function lastContacts(view: PlayerView): readonly TileCoord[] {
  const lastSeen = view.mission.vision.tdf?.lastSeen ?? {};
  const spotted = new Set(view.enemies.map((enemy) => enemy.id));
  const contacts: TileCoord[] = [];
  for (const unit of view.mission.units) {
    if (unit.team !== "bugs" || unit.hp <= 0 || spotted.has(unit.id)) {
      continue;
    }
    const seen = lastSeen[unit.id];
    if (seen !== undefined && view.graph.index.inBounds(seen)) {
      contacts.push(seen);
    }
  }
  return contacts;
}

/** Sweep tiles kept at most, nearest the force first. */
const SWEEP_LIMIT = 64;

/**
 * Walkable ground the side cannot see right now, nearest `near` first
 * (the force's first unit unless told otherwise), at most `SWEEP_LIMIT`:
 * where a player looks for a straggler the tracker still counts once
 * every lead has gone cold and the map is explored. Each tile drops out
 * as it comes into sight, so a force walking these sweeps the map.
 */
export function sweep(
  view: PlayerView,
  near: readonly TileCoord[] = anchorOf(view),
): readonly TileCoord[] {
  const index = view.graph.index;
  const visible = new Set(view.mission.vision.tdf?.visible ?? []);
  const found: TileCoord[] = [];
  for (const tile of view.mission.map.tiles) {
    if (
      allows(tile.pass, PassMask.INFANTRY) &&
      !visible.has(index.keyOf(tile))
    ) {
      found.push({ x: tile.x, y: tile.y, z: tile.z });
    }
  }
  return nearestFirst(found, near, SWEEP_LIMIT);
}

/** Where a search is ranked from by default: the force's first unit, else the drop ship. */
function anchorOf(view: PlayerView): readonly TileCoord[] {
  const anchor = view.force[0]?.pos ?? view.mission.extraction[0];
  return anchor === undefined ? [] : [anchor];
}

/**
 * At most `limit` of `tiles`, nearest any of `near` first (flat
 * distance); the first `limit` as found when there is nothing to rank by.
 */
function nearestFirst<T extends TileCoord>(
  tiles: readonly T[],
  near: readonly TileCoord[],
  limit: number,
): readonly T[] {
  if (near.length === 0) {
    return tiles.slice(0, limit);
  }
  return tiles
    .map((tile) => ({
      tile,
      distance: Math.min(
        ...near.map((anchor) => manhattanDistance(tile, anchor)),
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((entry) => entry.tile);
}

// ===========================================
// Vantage
// ===========================================

/** Line-of-sight checks one vantage search spends at most. */
const VANTAGE_CHECKS = 3000;

/** Goals a vantage search finds a view of before it stops. */
const VANTAGE_GOALS = 4;

/**
 * Tiles `unit` could stand on and see one of `goals` from, within its
 * sight range: where a player goes to look at a place it cannot walk
 * up to or into. A bug holding the doorway it hides behind, a room a
 * mech cannot enter, a floor above seen through its window. Walking at
 * such a goal gets the unit no closer; walking to one of these puts it
 * in sight.
 *
 * ```
 *   x: 0 1 2 3 │ 4 5 6 7        A  stands at the door, sees nothing
 *   z=2    . A D b . .         b  holds the doorway
 *   z=6    . . D v . .         v  a vantage: through the other door
 * ```
 *
 * Goals are tried nearest the unit first, and the search stops once
 * `VANTAGE_GOALS` of them have a view or `VANTAGE_CHECKS` lines have
 * been traced. Only tiles the unit's class can stand on, with nobody
 * else on them, from which the unit can reach them (`reachable`), count.
 */
export function vantagePoints(
  view: PlayerView,
  unit: Unit,
  goals: readonly TileCoord[],
  reachable: ReadonlyMap<number, number>,
): readonly TileCoord[] {
  const index = view.graph.index;
  const mask = passMaskFor(unit.passClass);
  const range = sightRangeOf(view.mission, unit);
  const occupied = new Set(
    view.mission.units
      .filter((other) => other.hp > 0 && other.id !== unit.id)
      .map((other) => index.keyOf(other.pos)),
  );
  const found = new Map<number, TileCoord>();
  let viewed = 0;
  let checks = 0;
  const nearest = [...goals].sort(
    (a, b) => manhattanDistance(a, unit.pos) - manhattanDistance(b, unit.pos),
  );
  for (const goal of nearest) {
    if (viewed >= VANTAGE_GOALS || checks >= VANTAGE_CHECKS) break;
    let seen = false;
    for (let dx = -range; dx <= range; dx++) {
      const reach = range - Math.abs(dx);
      for (let dz = -reach; dz <= reach; dz++) {
        for (const tile of index.column(goal.x + dx, goal.z + dz)) {
          const key = index.keyOf(tile);
          if (
            !allows(tile.pass, mask) ||
            occupied.has(key) ||
            !reachable.has(key)
          ) {
            continue;
          }
          checks++;
          if (hasLineOfSight(view.mission.map, tile, goal, index)) {
            found.set(key, { x: tile.x, y: tile.y, z: tile.z });
            seen = true;
          }
        }
      }
    }
    if (seen) viewed++;
  }
  return [...found.values()];
}

// ===========================================
// Danger
// ===========================================

/**
 * Tile keys inside the blast of every charge the force has set (a
 * breaching charge, a tunnel mouth's charge), which the HUD draws on the
 * ground until it blows: nobody sensible ends a move there. Measured
 * flat, one tile wider than the blast.
 */
export function dangerKeys(
  view: PlayerView,
  catalogue: EquipmentCatalogue,
): ReadonlySet<number> {
  const keys = new Set<number>();
  if (view.mission.charges.length === 0) {
    return keys;
  }
  const index = view.graph.index;
  for (const charge of view.mission.charges) {
    const radius =
      (catalogue.get(charge.equipmentId)?.profile?.aoe?.radius ?? 0) + 1;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > radius) continue;
        for (const tile of index.column(
          charge.tile.x + dx,
          charge.tile.z + dz,
        )) {
          keys.add(index.keyOf(tile));
        }
      }
    }
  }
  return keys;
}
