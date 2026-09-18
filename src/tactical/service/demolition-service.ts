import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import { oppositeDirection, stepGridPos } from "../../core/service/grid-math";
import { CoverLevel } from "../../mapgen/model/cover";
import type { Prop } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { WallKind, WallSet } from "../../mapgen/model/wall";
import { propTiles } from "../../mapgen/service/prop-footprint";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { DemolitionTuning } from "../model/demolition-tuning";
import type { StructureCatalogue } from "../model/structure-catalogue";

// ===========================================
// Types
// ===========================================

/** One wall edge brought down: the tile it was read from, the side, and what it was. */
export interface DemolishedWall {
  readonly tile: TileCoord;
  readonly side: Direction;
  readonly kind: WallKind;
}

/** What a demolition did: the map afterwards and everything that fell. */
export interface Demolition {
  readonly map: TacticalMap;
  /** Props removed whole, in `props` order. */
  readonly props: readonly Prop[];
  /** Wall edges removed, each once, in footprint order. */
  readonly walls: readonly DemolishedWall[];
}

// ===========================================
// Demolition
// ===========================================

/**
 * Brings down everything in `footprint` that `force` can (#1121), and
 * returns the map as it stands afterwards. Pure: the map handed in is
 * never touched.
 *
 * ```
 *   for each footprint tile:
 *     prop on it, catalogue force ≤ force ──► every tile of the prop cleared:
 *                                             propId gone, pass ← surface default,
 *                                             cover NONE, blocksLos false; prop removed
 *     wall on an edge, wall force ≤ force ──► edge cleared on this tile and mirrored
 *                                             on the neighbour (invariant I3)
 * ```
 *
 * A cleared tile's `pass` is what its surface allows, which is exactly
 * what the freezer wrote before the prop stood there (ADR 0004 §4.2):
 * the denormalised fields are re-derived from the same sources, so a
 * demolished map is one the generator could have produced. A prop with
 * no demolition tier — a boulder — is never touched, whatever the force.
 *
 * @param map - The map before the blast.
 * @param footprint - The tiles the blast reached.
 * @param force - The weapon's demolition force; `0` or less changes nothing.
 * @param structures - Prop forces and surface passability.
 * @param tuning - Wall forces.
 * @param index - An index over `map`, built here when the caller has none.
 * @returns The map afterwards and what fell.
 */
export function demolish(
  map: TacticalMap,
  footprint: readonly TileCoord[],
  force: number,
  structures: StructureCatalogue,
  tuning: DemolitionTuning,
  index: TileIndex = new TileIndex(map),
): Demolition {
  if (force <= 0 || footprint.length === 0) {
    return { map, props: [], walls: [] };
  }
  const patches = new Map<number, Tile>();
  const patchOf = (coord: TileCoord): Tile | undefined => {
    const key = index.keyOf(coord);
    const patched = patches.get(key);
    if (patched !== undefined) {
      return patched;
    }
    const original = index.getAt(coord);
    if (original !== undefined) {
      patches.set(key, original);
    }
    return original;
  };
  const put = (tile: Tile): void => {
    patches.set(index.keyOf(tile), tile);
  };

  // Props first, whole: a car across two tiles falls when either is hit.
  const removed: Prop[] = [];
  const removedIds = new Set<string>();
  for (const coord of footprint) {
    const propId = index.getAt(coord)?.propId;
    if (propId === undefined || removedIds.has(propId)) {
      continue;
    }
    const prop = map.props.find((candidate) => candidate.id === propId);
    if (prop === undefined) {
      continue;
    }
    const needed = structures.propForce(prop.kind);
    if (needed === undefined || needed > force) {
      continue;
    }
    removedIds.add(prop.id);
    removed.push(prop);
    for (const cell of propTiles(prop)) {
      const tile = patchOf(cell);
      if (tile === undefined) {
        continue;
      }
      const { propId: _gone, ...bare } = tile;
      put({
        ...bare,
        pass: structures.surfacePass(tile.surface),
        mechMoveCost: 2,
        coverProvided: CoverLevel.NONE,
        blocksLos: false,
      });
    }
  }

  // Then walls, each edge once however many footprint tiles share it.
  const walls: DemolishedWall[] = [];
  const cleared = new Set<string>();
  for (const coord of footprint) {
    for (const side of DIRECTIONS) {
      const here = patchOf(coord);
      const kind = here?.walls[side];
      if (here === undefined || kind === undefined) {
        continue;
      }
      if (tuning.wallForce[kind] > force) {
        continue;
      }
      const edge = `${String(index.keyOf(coord))}:${side}`;
      if (cleared.has(edge)) {
        continue;
      }
      put({ ...here, walls: withoutWall(here.walls, side) });
      cleared.add(edge);
      const across = stepGridPos(coord, side);
      const there = patchOf(across);
      if (there !== undefined) {
        const back = oppositeDirection(side);
        if (there.walls[back] !== undefined) {
          put({ ...there, walls: withoutWall(there.walls, back) });
        }
        cleared.add(`${String(index.keyOf(across))}:${back}`);
      }
      walls.push({ tile: { x: coord.x, y: coord.y, z: coord.z }, side, kind });
    }
  }

  if (removed.length === 0 && walls.length === 0) {
    return { map, props: [], walls: [] };
  }
  return {
    map: {
      ...map,
      tiles: map.tiles.map((tile) => patches.get(index.keyOf(tile)) ?? tile),
      props: map.props.filter((prop) => !removedIds.has(prop.id)),
    },
    props: removed,
    walls,
  };
}

// ===========================================
// Helpers
// ===========================================

/** The wall set without one side. */
function withoutWall(walls: WallSet, side: Direction): WallSet {
  const { [side]: _gone, ...rest } = walls;
  return rest;
}
