import type { Direction } from "../../core/model/direction";
import { oppositeDirection, stepGridPos } from "../../core/service/grid-math";
import type { CoverLevel } from "../../mapgen/model/cover";
import { CoverLevel as Cover } from "../../mapgen/model/cover";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { WallKind } from "../../mapgen/model/wall";
import { TileIndex } from "../../mapgen/service/tile-index";

// ===========================================
// Constants
// ===========================================

/**
 * Height above a tile's level a unit sees and is seen at, in levels. Half
 * a storey: a same-level shot passes through anything on its tiles, while
 * a shooter one level up looks over a prop near its own feet and is still
 * blocked by one next to the target.
 */
export const EYE_HEIGHT = 0.5;

/** Two traversal parameters closer than this cross a corner exactly. */
const CORNER_EPSILON = 1e-9;

/** Shared empty list for the orthogonal steps, which graze nothing. */
const NO_GRAZED: readonly PlaneCell[] = [];

// ===========================================
// Types
// ===========================================

/** A cell on the map plane the sight line passes through. */
export interface PlaneCell {
  readonly x: number;
  readonly z: number;
}

/** One cell the line visits, with the parameter span it spends inside. */
export interface VisitedCell extends PlaneCell {
  /** Line parameter where the line enters the cell, `0` at `from`. */
  readonly tEnter: number;
  /** Line parameter where the line leaves the cell, `1` at `to`. */
  readonly tExit: number;
}

/** An edge the line crosses, named from one of its two cells. */
export interface EdgeCrossing extends PlaneCell {
  readonly side: Direction;
}

/** A crossing from one cell to the next, with every edge the line passes over. */
export interface Crossing {
  /** Line parameter of the crossing. */
  readonly t: number;
  /** One edge for an orthogonal step; the four edges meeting at a corner otherwise. */
  readonly edges: readonly EdgeCrossing[];
  /**
   * The two cells a corner step passes between without entering, empty
   * for an orthogonal step. Named here rather than re-derived from the
   * edge order, which is geometry the caller should not have to know.
   */
  readonly grazed: readonly PlaneCell[];
}

/** The line between two tile centres, as the cells it visits and the edges it crosses. */
export interface SightLine {
  readonly cells: readonly VisitedCell[];
  readonly crossings: readonly Crossing[];
}

// ===========================================
// Line of sight
// ===========================================

/**
 * True when nothing opaque stands between two tiles (GDD §6.2). The line
 * runs from eye height over `from` to eye height over `to`, and at every
 * point the level it is passing through is checked:
 *
 * ```
 *   edge crossed  ──► a solid or door wall on that edge, on either tile ──► blocked
 *                     a window ─────────────────────────────────────────► clear
 *   cell visited  ──► a tile whose prop blocks sight (Tile.blocksLos) ───► blocked
 *                     no tile, but ground higher in that column ────────► blocked
 *                     (the line is inside a hill: terrain is sparse)
 *   corner hit    ──► any of the four edges meeting there, as above
 *
 *   height(t) = (from.y + EYE) + ((to.y + EYE) − (from.y + EYE)) · t
 *   level(t)  = ⌊height(t)⌋      walls and props fill [level, level + 1)
 * ```
 *
 * The endpoint tiles never block, a missing tile with only sky above it
 * never blocks, and a line that passes exactly through a corner touches
 * only that corner's edges, not the two cells it grazes. Symmetric in
 * `from` and `to`.
 */
export function hasLineOfSight(
  map: TacticalMap,
  from: TileCoord,
  to: TileCoord,
  index: TileIndex = new TileIndex(map),
): boolean {
  if (from.x === to.x && from.z === to.z) {
    return true;
  }
  const line = traceLine(from, to);
  const heightAt = heightFunction(from, to);

  for (const crossing of line.crossings) {
    const level = Math.floor(heightAt(crossing.t));
    for (const edge of crossing.edges) {
      if (wallBlocksAt(index, edge, level)) {
        return false;
      }
    }
    if (seamIsSealed(index, crossing, level)) {
      return false;
    }
  }
  for (const cell of line.cells.slice(1, -1)) {
    const level = Math.floor(heightAt((cell.tEnter + cell.tExit) / 2));
    if (blocksSightAt(index, cell.x, level, cell.z)) {
      return false;
    }
  }
  return true;
}

/**
 * Whether a cell is solid rock: **no tile of its own**, and ground
 * higher in the same column (#593). Shared by the cell rule and the
 * corner rule, which ask the same question of different cells.
 *
 * Both halves matter. Asking only "is there ground above this level"
 * calls ordinary walkable ground beside a hill solid, which blocked
 * three times as many corner lines as the rule intends (#646).
 *
 * Terrain mass is the **absence** of a record — ADR 0004 §4.2, *"tiles
 * are sparse: air and solid rock have no record"* — so a line through
 * the inside of a ridge finds nothing there and used to read it as clear
 * air. Two units on level 0 could see, and shoot, straight through a
 * two-level hill, and fog of war inherited the same hole.
 *
 * ```
 *   nothing at (x, L, z)  and  some tile in that column above L  ──► solid
 *   nothing at (x, L, z)  and  nothing above                     ──► sky
 * ```
 *
 * The model has no overhangs, so ground higher up in the same column can
 * only mean the line is buried in it. Shooting over a wall from high
 * ground is untouched: the line's level rises with the shooter, so it
 * clears the columns it passes rather than tunnelling through them.
 */
function isSolidAt(
  index: TileIndex,
  x: number,
  level: number,
  z: number,
): boolean {
  return (
    index.get(x, level, z) === undefined &&
    index.column(x, z).some((tile) => tile.y > level)
  );
}

/**
 * Whether a cell stops sight at all: solid rock (#593), or a tile whose
 * prop is opaque.
 *
 * The cell rule and the corner rule both ask this one question, which is
 * what keeps them agreeing. They did not always: #646 sealed corners
 * against rock by calling `isSolidAt` directly, so two dense trees
 * meeting at a corner let a line thread the seam that two boulders — or
 * a wall — in the same place would stop (#679). Rock is opaque by nature
 * and a prop is opaque by tuning, but a sightline cannot tell the
 * difference, so neither should these two rules.
 */
function blocksSightAt(
  index: TileIndex,
  x: number,
  level: number,
  z: number,
): boolean {
  return (
    index.get(x, level, z)?.blocksLos === true || isSolidAt(index, x, level, z)
  );
}

/**
 * Whether a corner the line passes exactly through is sealed on both
 * sides (#646, #679).
 *
 * A corner step moves diagonally and never enters the two cells it
 * passes between, so the cell loop is never asked about them. Walls cope
 * because the wall rule reads all four edges meeting at the corner;
 * terrain did not, and a line could thread the diagonal seam between two
 * hills that a wall in the same place would stop.
 *
 * ```
 *   G1 │ B          B  entered next      ──► both G solid ──► blocked
 *   ───┼───         A  left behind       ──► either open  ──► clear
 *   A  │ G2         G1, G2  only grazed
 * ```
 *
 * Both have to be opaque. One hill touched at a single corner still
 * leaves an open diagonal gap beside it, and sealing that would make
 * terrain stricter than the masonry it is meant to agree with. Mixed
 * pairs seal too: a boulder and a container stack meeting at a corner
 * close it, because the gap a soldier would be looking through is the
 * same gap either way.
 *
 * Measured before each was written: 175 of 197,486 sight lines across 24
 * generated maps threaded a rock seam (0.089 %, on 17 of 24 maps), and a
 * further 93 of 197,311 threaded a prop seam (0.047 %, on 12 of 24).
 */
function seamIsSealed(
  index: TileIndex,
  crossing: Crossing,
  level: number,
): boolean {
  return (
    crossing.grazed.length > 0 &&
    crossing.grazed.every((cell) => blocksSightAt(index, cell.x, level, cell.z))
  );
}

/**
 * Walks the map plane from the centre of `from` to the centre of `to`,
 * listing every cell visited and every edge crossed, in order. An exact
 * corner hit steps diagonally through the corner and records the four
 * edges meeting there. Exported so the preview harness can draw a line.
 */
export function traceLine(from: PlaneCell, to: PlaneCell): SightLine {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const stepX = Math.sign(dx);
  const stepZ = Math.sign(dz);
  const deltaX = dx === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(dx);
  const deltaZ = dz === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(dz);
  let nextX = dx === 0 ? Number.POSITIVE_INFINITY : deltaX / 2;
  let nextZ = dz === 0 ? Number.POSITIVE_INFINITY : deltaZ / 2;

  let x = from.x;
  let z = from.z;
  let tEnter = 0;
  const cells: VisitedCell[] = [];
  const crossings: Crossing[] = [];

  while (x !== to.x || z !== to.z) {
    if (Math.abs(nextX - nextZ) < CORNER_EPSILON) {
      const t = nextX;
      cells.push({ x, z, tEnter, tExit: t });
      crossings.push({
        t,
        edges: [
          { x, z, side: stepX > 0 ? "e" : "w" },
          { x, z, side: stepZ > 0 ? "s" : "n" },
          { x: x + stepX, z: z + stepZ, side: stepX > 0 ? "w" : "e" },
          { x: x + stepX, z: z + stepZ, side: stepZ > 0 ? "n" : "s" },
        ],
        grazed: [
          { x: x + stepX, z },
          { x, z: z + stepZ },
        ],
      });
      x += stepX;
      z += stepZ;
      nextX += deltaX;
      nextZ += deltaZ;
      tEnter = t;
    } else if (nextX < nextZ) {
      const t = nextX;
      cells.push({ x, z, tEnter, tExit: t });
      crossings.push({
        t,
        edges: [{ x, z, side: stepX > 0 ? "e" : "w" }],
        grazed: NO_GRAZED,
      });
      x += stepX;
      nextX += deltaX;
      tEnter = t;
    } else {
      const t = nextZ;
      cells.push({ x, z, tEnter, tExit: t });
      crossings.push({
        t,
        edges: [{ x, z, side: stepZ > 0 ? "s" : "n" }],
        grazed: NO_GRAZED,
      });
      z += stepZ;
      nextZ += deltaZ;
      tEnter = t;
    }
  }
  cells.push({ x, z, tEnter, tExit: 1 });
  return { cells, crossings };
}

// ===========================================
// Cover
// ===========================================

/**
 * The cover a target enjoys against an attacker (GDD §6.2): the best of
 * the target tile's own walls and the cover props on its neighbours, on
 * the sides the attack comes from. Cover on a side counts only while the
 * attacker is more along that side's axis than across it (within 45°);
 * an exact diagonal counts both sides, and an attacker anywhere else has
 * flanked that cover. Elevation does not remove cover; it is scored
 * separately by `elevationBonus`.
 *
 * ```
 *   attacker offset (dx, dz) from the target
 *     |dx| ≥ |dz|, dx ≠ 0 ──► side e (dx > 0) or w
 *     |dz| ≥ |dx|, dz ≠ 0 ──► side s (dz > 0) or n
 *   per side:  wall on the target's edge   solid → HIGH · window/door → LOW
 *              neighbour tile at the same level ──► its coverProvided
 *   result:    max over the attack sides, NONE when none
 * ```
 */
export function coverAgainst(
  map: TacticalMap,
  target: TileCoord,
  attacker: TileCoord,
  index: TileIndex = new TileIndex(map),
): CoverLevel {
  const dx = attacker.x - target.x;
  const dz = attacker.z - target.z;
  if (dx === 0 && dz === 0) {
    return Cover.NONE;
  }
  const targetTile = index.getAt(target);
  let best: CoverLevel = Cover.NONE;
  for (const side of attackSides(dx, dz)) {
    const fromWall = coverFromWall(targetTile?.walls[side]);
    const neighbour = index.getAt(stepGridPos(target, side));
    const fromNeighbour = neighbour?.coverProvided ?? Cover.NONE;
    best = maxCover(best, maxCover(fromWall, fromNeighbour));
  }
  return best;
}

/**
 * Levels the attacker stands above the target: positive when shooting
 * down, negative when shooting up, `0` on the same level. The hit-chance
 * rule (#327) turns it into a modifier; this just measures it.
 */
export function elevationBonus(from: TileCoord, to: TileCoord): number {
  return from.y - to.y;
}

// ===========================================
// Helpers
// ===========================================

/** The sides of the target an attack at offset `(dx, dz)` arrives from. */
function attackSides(dx: number, dz: number): Direction[] {
  const sides: Direction[] = [];
  if (dx !== 0 && Math.abs(dx) >= Math.abs(dz)) {
    sides.push(dx > 0 ? "e" : "w");
  }
  if (dz !== 0 && Math.abs(dz) >= Math.abs(dx)) {
    sides.push(dz > 0 ? "s" : "n");
  }
  return sides;
}

/**
 * Cover a wall kind gives to the unit behind it. A solid wall is a full
 * body of masonry; a window, a door and a half wall are all something to
 * crouch behind rather than hide inside (#508).
 */
function coverFromWall(kind: WallKind | undefined): CoverLevel {
  switch (kind) {
    case undefined:
      return Cover.NONE;
    case "solid":
      return Cover.HIGH;
    default:
      return Cover.LOW;
  }
}

/** The higher of two cover levels. */
function maxCover(a: CoverLevel, b: CoverLevel): CoverLevel {
  return a >= b ? a : b;
}

/** Eye-height line between two tiles as a function of the parameter `t`. */
function heightFunction(from: TileCoord, to: TileCoord): (t: number) => number {
  const start = from.y + EYE_HEIGHT;
  const end = to.y + EYE_HEIGHT;
  return (t) => start + (end - start) * t;
}

/** True when an opaque wall sits on the edge at the given level, on either tile. */
function wallBlocksAt(
  index: TileIndex,
  edge: EdgeCrossing,
  level: number,
): boolean {
  const here = index.get(edge.x, level, edge.z);
  const there = index.getAt(
    stepGridPos({ x: edge.x, y: level, z: edge.z }, edge.side),
  );
  return (
    wallIsOpaque(here?.walls[edge.side]) ||
    wallIsOpaque(there?.walls[oppositeDirection(edge.side)])
  );
}

/**
 * Solid walls and doors block sight; windows and half walls do not — a
 * parapet is waist-high, which is the point of it (#508).
 */
function wallIsOpaque(kind: WallKind | undefined): boolean {
  return kind === "solid" || kind === "door";
}

/** Narrow re-export so callers can type cover results without importing mapgen. */
export type { CoverLevel, Tile };
