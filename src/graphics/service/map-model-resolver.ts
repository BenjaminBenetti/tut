import type { ModelAssetId } from "../../content/data/model-ids";
import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import type { Vec3 } from "../../core/model/grid";
import { stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Tile } from "../../mapgen/model/tile";
import { TileIndex } from "../../mapgen/service/tile-index";
import {
  propModel,
  ROAD_VARIANTS,
  SIDEWALK_VARIANTS,
  surfaceModel,
  wallModel,
  wallFamilyForWall,
} from "../data/map-model-table";
import { GROUND_SLAB_THICKNESS } from "../data/tactical-overlay-palette";
import { tileTop } from "../view/tactical-map-view";

// ===========================================
// Types
// ===========================================

/**
 * One model to draw: which asset, where its pivot goes, and how far it
 * is turned. Pivots follow the kit conventions in style guide §7 — tiles
 * and props at their base centre, walls at the base midpoint of the edge
 * they stand on.
 */
export interface ModelPlacement {
  readonly modelId: ModelAssetId;
  /** Level group the placement hangs on, so the level slider still peels it off. */
  readonly level: number;
  readonly position: Vec3;
  /** Quarter turns clockwise seen from above, matching `Prop.rotation`. */
  readonly turns: Rotation;
  /**
   * The tile this belongs to. Carried so the renderer can dim or drop it
   * with that tile's vision (#551) — a wall is only ever as visible as
   * the tile it stands on.
   */
  readonly tile: TileCoord;
}

/** Everything on a map that resolves to a model, split by what it replaces. */
export interface MapModelPlacements {
  readonly tiles: readonly ModelPlacement[];
  readonly walls: readonly ModelPlacement[];
  readonly props: readonly ModelPlacement[];
}

// ===========================================
// Constants
// ===========================================

/**
 * How far water sits below the surrounding ground (style guide §7).
 */
export const WATER_RECESS = 0.02;

/**
 * Base orientation the city kit is authored in, as the directions each
 * piece connects at zero turns. A straight runs east–west, a corner
 * joins east and south, and a T joins east, south and west so its
 * missing side is north.
 *
 * ```
 *   straight      corner        t            cross
 *   · · ·         · · ·         · · ·        · │ ·
 *   ──┼──         ··┼──         ──┼──        ──┼──
 *   · · ·         · │ ·         · │ ·        · │ ·
 * ```
 *
 * If the art turns out to be authored a quarter turn off, this is the
 * one place to correct it.
 */
const STRAIGHT_AXIS: readonly Direction[] = ["e", "w"];
const CORNER_AT_ZERO: readonly Direction[] = ["e", "s"];
const T_MISSING_AT_ZERO: Direction = "n";

// ===========================================
// Resolution
// ===========================================

/**
 * Every tile, wall and prop on the map as a model placement (#474, style
 * guide §7). This is the map-cell counterpart of the unit path's
 * `template.modelId → models.load` step: it decides which model each
 * cell needs and where it goes, and knows nothing about three.js.
 *
 * ```
 *   tile  ──► surface id ──► model, road and sidewalk turned to fit their neighbours
 *   wall  ──► wall kind  ──► model, on the edge it stands on, running along it
 *   prop  ──► prop kind  ──► model, at the tile's base centre, turned by Prop.rotation
 * ```
 *
 * A surface or prop kind with no registered art is skipped rather than
 * substituted, so a biome that adds a kind in data renders the rest of
 * the map instead of failing.
 */
export function resolveMapModels(
  map: TacticalMap,
  index: TileIndex = new TileIndex(map),
): MapModelPlacements {
  return {
    tiles: resolveTiles(map, index),
    walls: resolveWalls(map, index),
    props: resolveProps(map, index),
  };
}

/** The distinct model ids a map needs, for preloading in one pass. */
export function mapModelIds(
  placements: MapModelPlacements,
): readonly ModelAssetId[] {
  const ids = new Set<ModelAssetId>();
  for (const group of [placements.tiles, placements.walls, placements.props]) {
    for (const placement of group) {
      ids.add(placement.modelId);
    }
  }
  return [...ids];
}

// ===========================================
// Stairs
// ===========================================

/**
 * Quarter turns that point a stairs tile's model up its connector (#766).
 *
 * A `stairs` surface already resolves to `building.stairs` like any other
 * surface, but a surface slab is unturned, so every staircase climbed
 * along +Z whichever way its connector actually went — the "tilted slab"
 * of #748, with the placeholder plank still drawn through it. The model
 * is authored with its steps rising along +Z from a base pivot, so it
 * turns to face the connector's upper end.
 *
 * `placementMatrix` rotates by `-turns × π/2` about Y, so +Z maps to
 * `(sin θ, cos θ)` in (x, z): turns 0 → south (+z), 1 → west (−x),
 * 2 → north (−z), 3 → east (+x). A tile with no stairs connector of its
 * own keeps 0, so a stray `stairs` surface still draws something.
 */
function stairsTurns(tile: Tile, map: TacticalMap): Rotation {
  const up = map.connectors.find(
    (c) =>
      c.kind === "stairs" &&
      c.from.x === tile.x &&
      c.from.y === tile.y &&
      c.from.z === tile.z,
  );
  if (up === undefined) {
    return 0;
  }
  const dx = up.to.x - up.from.x;
  const dz = up.to.z - up.from.z;
  if (dz > 0) return 0;
  if (dx < 0) return 1;
  if (dz < 0) return 2;
  return 3;
}

// ===========================================
// Tiles
// ===========================================

/**
 * One slab per tile, sitting on the tile's top face; water is recessed.
 *
 * The slab model is authored with its pivot at centre (style guide §7),
 * so it is placed half a thickness below `tileTop` for its **top face**
 * to land there — the same place the preview box puts its own top face.
 * Placing the pivot at `tileTop` is what left the surface half a slab
 * high and everything measured from it half a slab low (#557).
 */
function resolveTiles(
  map: TacticalMap,
  index: TileIndex,
): readonly ModelPlacement[] {
  const placements: ModelPlacement[] = [];
  for (const tile of map.tiles) {
    const fitted = fitSurface(tile, index, map);
    if (fitted === undefined) {
      continue;
    }
    const drop = tile.surface === SurfaceIds.WATER ? WATER_RECESS : 0;
    // A slab is pivoted at its centre and sits half a thickness below the
    // top; the stairs model is pivoted at its base and stands on it (#766).
    const lift =
      tile.surface === SurfaceIds.STAIRS ? 0 : GROUND_SLAB_THICKNESS / 2;
    placements.push({
      modelId: fitted.modelId,
      level: tile.y,
      position: {
        x: tile.x + 0.5,
        y: tileTop(tile.y) - lift - drop,
        z: tile.z + 0.5,
      },
      turns: fitted.turns,
      tile: { x: tile.x, y: tile.y, z: tile.z },
    });
  }
  return placements;
}

/**
 * The model and turn for a tile's surface. Road and sidewalk choose a
 * junction piece from the same-surface neighbours at their own level;
 * every other surface is a single unturned slab.
 */
function fitSurface(
  tile: Tile,
  index: TileIndex,
  map: TacticalMap,
): { modelId: ModelAssetId; turns: Rotation } | undefined {
  if (tile.surface === SurfaceIds.ROAD) {
    return fitJunction(tile, index, ROAD_VARIANTS.straight, ROAD_VARIANTS);
  }
  if (tile.surface === SurfaceIds.SIDEWALK) {
    return fitJunction(tile, index, SIDEWALK_VARIANTS.straight, {
      straight: SIDEWALK_VARIANTS.straight,
      corner: SIDEWALK_VARIANTS.corner,
      // Sidewalk ships no junction pieces; a crossing reads as a plain slab.
      t: SIDEWALK_VARIANTS.straight,
      cross: SIDEWALK_VARIANTS.straight,
    });
  }
  const modelId = surfaceModel(tile.surface);
  if (modelId === undefined) {
    return undefined;
  }
  return {
    modelId,
    turns: tile.surface === SurfaceIds.STAIRS ? stairsTurns(tile, map) : 0,
  };
}

/**
 * Picks the junction piece and turn for a tile from the neighbours
 * sharing its surface:
 *
 * ```
 *   4 neighbours ──► cross, unturned
 *   3            ──► t,      turned so its missing side faces the gap
 *   2 opposite   ──► straight along that axis
 *   2 adjacent   ──► corner, turned onto that pair
 *   1 or 0       ──► straight along the one link, or east–west
 * ```
 */
function fitJunction(
  tile: Tile,
  index: TileIndex,
  fallback: ModelAssetId,
  variants: {
    straight: ModelAssetId;
    corner: ModelAssetId;
    t: ModelAssetId;
    cross: ModelAssetId;
  },
): { modelId: ModelAssetId; turns: Rotation } {
  const linked = DIRECTIONS.filter(
    (side) => index.getAt(stepGridPos(tile, side))?.surface === tile.surface,
  );
  if (linked.length === 4) {
    return { modelId: variants.cross, turns: 0 };
  }
  if (linked.length === 3) {
    const missing = DIRECTIONS.find((side) => !linked.includes(side));
    return {
      modelId: variants.t,
      turns: turnsBetween(T_MISSING_AT_ZERO, missing ?? T_MISSING_AT_ZERO),
    };
  }
  if (linked.length === 2) {
    const [first, second] = linked as [Direction, Direction];
    if (opposite(first) === second) {
      return {
        modelId: variants.straight,
        turns: STRAIGHT_AXIS.includes(first) ? 0 : 1,
      };
    }
    return { modelId: variants.corner, turns: cornerTurns(linked) };
  }
  const only = linked[0];
  return {
    modelId: only === undefined ? fallback : variants.straight,
    turns: only === undefined || STRAIGHT_AXIS.includes(only) ? 0 : 1,
  };
}

// ===========================================
// Walls
// ===========================================

/**
 * One wall per segment, standing on the edge it belongs to and running
 * along it. Shared walls are stored on both tiles, so the south and east
 * sides are skipped when a tile lies beyond them at the same level — the
 * neighbour draws that edge, exactly as the placeholder view decides it.
 */
function resolveWalls(
  map: TacticalMap,
  index: TileIndex,
): readonly ModelPlacement[] {
  const placements: ModelPlacement[] = [];
  for (const tile of map.tiles) {
    for (const side of DIRECTIONS) {
      const kind = tile.walls[side];
      if (kind === undefined || neighbourDrawsWall(tile, side, index)) {
        continue;
      }
      placements.push({
        modelId: wallModel(kind, wallFamilyForWall(kind, tile.buildingId)),
        level: tile.y,
        position: wallCentre(tile, side),
        // A wall is authored along +X, so north and south edges are
        // unturned and east and west edges take a quarter turn.
        turns: side === "n" || side === "s" ? 0 : 1,
        tile: { x: tile.x, y: tile.y, z: tile.z },
      });
    }
  }
  return placements;
}

/** True when the tile beyond `side` exists at the same level and will draw the shared wall. */
function neighbourDrawsWall(
  tile: Tile,
  side: Direction,
  index: TileIndex,
): boolean {
  if (side !== "s" && side !== "e") {
    return false;
  }
  return index.getAt(stepGridPos(tile, side)) !== undefined;
}

/** The base midpoint of one edge of a tile. */
function wallCentre(tile: Tile, side: Direction): Vec3 {
  const top = tileTop(tile.y);
  if (side === "n" || side === "s") {
    return { x: tile.x + 0.5, y: top, z: tile.z + (side === "s" ? 1 : 0) };
  }
  return { x: tile.x + (side === "e" ? 1 : 0), y: top, z: tile.z + 0.5 };
}

// ===========================================
// Props
// ===========================================

/** One prop per record, at its tile's base centre, turned as mapgen placed it. */
function resolveProps(
  map: TacticalMap,
  index: TileIndex,
): readonly ModelPlacement[] {
  const placements: ModelPlacement[] = [];
  for (const prop of map.props) {
    const tile = index.getAt(prop.tile);
    const modelId = propModel(prop.kind);
    if (tile === undefined || modelId === undefined) {
      continue;
    }
    placements.push({
      modelId,
      level: tile.y,
      position: { x: tile.x + 0.5, y: tileTop(tile.y), z: tile.z + 0.5 },
      turns: prop.rotation,
      tile: { x: tile.x, y: tile.y, z: tile.z },
    });
  }
  return placements;
}

// ===========================================
// Turning
// ===========================================

/** The direction opposite this one. */
function opposite(side: Direction): Direction {
  return side === "n" ? "s" : side === "s" ? "n" : side === "e" ? "w" : "e";
}

/** Quarter turns clockwise that carry `from` onto `to`. */
function turnsBetween(from: Direction, to: Direction): Rotation {
  const delta = (DIRECTIONS.indexOf(to) - DIRECTIONS.indexOf(from) + 4) % 4;
  return delta as Rotation;
}

/**
 * Quarter turns carrying the corner's authored pair onto `linked`. Both
 * are adjacent pairs, so matching one member's turn matches the other.
 */
function cornerTurns(linked: readonly Direction[]): Rotation {
  const quarters: readonly Rotation[] = [0, 1, 2, 3];
  for (const turns of quarters) {
    const rotated = CORNER_AT_ZERO.map((side) => turnBy(side, turns));
    if (rotated.every((side) => linked.includes(side))) {
      return turns;
    }
  }
  return 0;
}

/** The direction `side` becomes after `turns` quarter turns clockwise. */
function turnBy(side: Direction, turns: Rotation): Direction {
  const index = (DIRECTIONS.indexOf(side) + turns) % 4;
  return DIRECTIONS[index] ?? side;
}
