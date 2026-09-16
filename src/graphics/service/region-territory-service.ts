import type { CityId } from "../../overworld/model/city";
import type { RegionId } from "../../overworld/model/region";
import type { GroundPoint } from "./coastline-projection";

// ===========================================
// Types
// ===========================================

/** One city as a Voronoi seed: where it is and which region claims its cell. */
export interface TerritorySeed {
  readonly cityId: CityId;
  readonly regionId: RegionId;
  /** The city on the ground plane, in world units. */
  readonly point: GroundPoint;
}

/** The rectangle the map plane covers, from the origin. */
export interface TerritoryBounds {
  readonly width: number;
  readonly depth: number;
}

/**
 * One edge of a cell. `neighbourCityId` is the seed on the other side
 * of the edge, or `undefined` where the edge lies on the map's border.
 */
export interface TerritoryEdge {
  readonly a: GroundPoint;
  readonly b: GroundPoint;
  readonly neighbourCityId: CityId | undefined;
}

/**
 * A city's Voronoi cell: the convex polygon of every point on the map
 * nearer this city than any other, tagged with the city's region.
 */
export interface TerritoryCell {
  readonly cityId: CityId;
  readonly regionId: RegionId;
  readonly seed: GroundPoint;
  /** Convex, in winding order, not closed; `edges[i]` runs from `vertices[i]`. */
  readonly vertices: readonly GroundPoint[];
  readonly edges: readonly TerritoryEdge[];
}

/** One border segment between two regions' territories. */
export interface RegionBorder {
  readonly a: GroundPoint;
  readonly b: GroundPoint;
  /** The two regions the segment separates, in no particular order. */
  readonly regionIds: readonly [RegionId, RegionId];
}

// ===========================================
// Internal types
// ===========================================

/** A polygon vertex carrying the tag of the edge that leaves it. */
interface TaggedVertex {
  readonly point: GroundPoint;
  readonly tag: CityId | undefined;
}

/** The half-plane of points nearer `seed` than `other`: `dot(p, normal) <= offset`. */
interface HalfPlane {
  readonly normal: GroundPoint;
  readonly offset: number;
}

// ===========================================
// Voronoi partition
// ===========================================

/**
 * Partitions the map rectangle into one convex cell per seed: the
 * Voronoi diagram of the cities (#1149). Each cell starts as the whole
 * rectangle and is clipped against the perpendicular bisector of every
 * other seed, keeping the side nearer its own seed. With a few dozen
 * seeds the O(n²) clipping is instant, and it needs no library.
 *
 * ```
 *   ┌────────┬──────────┐   every point in a cell is nearer its
 *   │  · a   │   · b    │   seed than any other; an edge between
 *   ├────┬───┴──┬───────┤   two cells is a piece of the bisector of
 *   │ ·c │  · d │  · e  │   their seeds, and is tagged with the
 *   └────┴──────┴───────┘   neighbour so region borders can be told
 *                           from interior edges
 * ```
 *
 * Distance is measured in world units, so the partition is isotropic
 * on the 2:1 plane rather than stretched by the layout's aspect.
 *
 * @param seeds - The cities; two at the same point make degenerate cells.
 * @param bounds - The map rectangle, from the origin.
 * @returns One cell per seed, in seed order.
 */
export function computeTerritories(
  seeds: readonly TerritorySeed[],
  bounds: TerritoryBounds,
): TerritoryCell[] {
  return seeds.map((seed) => {
    let polygon = rectangle(bounds);
    for (const other of seeds) {
      if (other === seed) {
        continue;
      }
      polygon = clipToHalfPlane(
        polygon,
        bisector(seed.point, other.point),
        other.cityId,
      );
    }
    return {
      cityId: seed.cityId,
      regionId: seed.regionId,
      seed: seed.point,
      vertices: polygon.map((vertex) => vertex.point),
      edges: polygon.map((vertex, index) => ({
        a: vertex.point,
        b: polygon[(index + 1) % polygon.length]?.point ?? vertex.point,
        neighbourCityId: vertex.tag,
      })),
    };
  });
}

/**
 * The segments where two regions meet: every cell edge whose neighbour
 * belongs to a different region, each reported once. Edges between two
 * cells of the same region are interior and are left out, which is
 * what merges a region's cells into one territory.
 *
 * @param cells - The partition from `computeTerritories`.
 * @returns Each border segment once, with the two regions it separates.
 */
export function regionBorders(cells: readonly TerritoryCell[]): RegionBorder[] {
  const regionOf = new Map<CityId, RegionId>();
  for (const cell of cells) {
    regionOf.set(cell.cityId, cell.regionId);
  }
  const borders: RegionBorder[] = [];
  for (const cell of cells) {
    for (const edge of cell.edges) {
      const neighbour = edge.neighbourCityId;
      if (neighbour === undefined || cell.cityId > neighbour) {
        // Map border, or the pair's other cell reports this edge.
        continue;
      }
      const neighbourRegion = regionOf.get(neighbour);
      if (neighbourRegion === undefined || neighbourRegion === cell.regionId) {
        continue;
      }
      borders.push({
        a: edge.a,
        b: edge.b,
        regionIds: [cell.regionId, neighbourRegion],
      });
    }
  }
  return borders;
}

/**
 * The cell a point falls in: by definition the one whose seed is
 * nearest. Ties go to the earlier cell.
 *
 * @param point - A point on the ground plane.
 * @param cells - The partition.
 * @returns The containing cell, or `undefined` when there are no cells.
 */
export function cellAt(
  point: GroundPoint,
  cells: readonly TerritoryCell[],
): TerritoryCell | undefined {
  let best: TerritoryCell | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    const distance = Math.hypot(cell.seed.x - point.x, cell.seed.z - point.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cell;
    }
  }
  return best;
}

/**
 * Signed area of a cell's polygon; positive when wound `x` toward `z`.
 * @param vertices - The polygon, not closed.
 * @returns The signed area in square world units.
 */
export function signedArea(vertices: readonly GroundPoint[]): number {
  let twice = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (a && b) {
      twice += a.x * b.z - b.x * a.z;
    }
  }
  return twice / 2;
}

// ===========================================
// Helpers
// ===========================================

/** The map rectangle as a tagged polygon whose every edge is map border. */
function rectangle(bounds: TerritoryBounds): TaggedVertex[] {
  return [
    { point: { x: 0, z: 0 }, tag: undefined },
    { point: { x: bounds.width, z: 0 }, tag: undefined },
    { point: { x: bounds.width, z: bounds.depth }, tag: undefined },
    { point: { x: 0, z: bounds.depth }, tag: undefined },
  ];
}

/**
 * The half-plane nearer `seed` than `other`: `|p−s|² ≤ |p−o|²`
 * rearranges to `2(o−s)·p ≤ |o|²−|s|²`.
 */
function bisector(seed: GroundPoint, other: GroundPoint): HalfPlane {
  return {
    normal: { x: 2 * (other.x - seed.x), z: 2 * (other.z - seed.z) },
    offset:
      other.x * other.x + other.z * other.z - seed.x * seed.x - seed.z * seed.z,
  };
}

/** How far a point is past the half-plane's edge; zero or less is inside. */
function excess(point: GroundPoint, plane: HalfPlane): number {
  return point.x * plane.normal.x + point.z * plane.normal.z - plane.offset;
}

/**
 * Sutherland–Hodgman against one half-plane, keeping edge tags: an
 * edge that survives keeps its tag, and the new edge that runs along
 * the clip line is tagged with the seed whose bisector it is.
 *
 * ```
 *   cur in,  next in  ─▶ emit cur (its edge continues)
 *   cur in,  next out ─▶ emit cur, then the exit point tagged `along`
 *   cur out, next in  ─▶ emit the entry point with cur's edge tag
 *   cur out, next out ─▶ nothing
 * ```
 */
function clipToHalfPlane(
  polygon: readonly TaggedVertex[],
  plane: HalfPlane,
  along: CityId,
): TaggedVertex[] {
  const output: TaggedVertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    if (!current || !next) {
      continue;
    }
    const currentExcess = excess(current.point, plane);
    const nextExcess = excess(next.point, plane);
    const currentInside = currentExcess <= 0;
    const nextInside = nextExcess <= 0;
    if (currentInside) {
      output.push(current);
    }
    if (currentInside !== nextInside) {
      const crossing = intersect(
        current.point,
        next.point,
        currentExcess,
        nextExcess,
      );
      output.push({
        point: crossing,
        tag: currentInside ? along : current.tag,
      });
    }
  }
  return output;
}

/** Where the segment `a`–`b` crosses the line, from the signed excess at each end. */
function intersect(
  a: GroundPoint,
  b: GroundPoint,
  excessA: number,
  excessB: number,
): GroundPoint {
  const t = excessA / (excessA - excessB);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}
