import type { Rng } from "../../../core/model/rng";
import { SurfaceIds } from "../../data/surfaces";
import type { MapDimensions } from "../../model/map-recipe";
import type { PlatformPad, PlatformRoute } from "../../model/platform-layout";
import type { ColumnCoord } from "../../model/road";
import type { SporePlatformTuning } from "../../model/spore-platform-tuning";
import type { SurfaceId } from "../../model/surface";

// ===========================================
// Constants
// ===========================================

/** Four neighbours. */
export const NEIGHBOURS_4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// ===========================================
// PlatformRaster
// ===========================================

/**
 * The working copy a platform stage is shaped on before the pass writes
 * it to the draft (#1179): a level, a surface and a handful of masks per
 * column, row-major. Void is level 0; deck columns carry the plate the
 * shaper grew there.
 *
 * ```
 *   deck      1 walkable deck, 0 void
 *   route     1 on a main route's band: level, never dressed
 *   podBeds   1 where a spawner pod may stand
 *   keepClear 1 where no prop may stand (pads and their aprons)
 * ```
 */
export class PlatformRaster {
  // ===========================================
  // Fields
  // ===========================================

  readonly width: number;
  readonly depth: number;
  readonly level: Int16Array;
  readonly surface: SurfaceId[];
  readonly deck: Uint8Array;
  readonly route: Uint8Array;
  readonly podBeds: Uint8Array;
  readonly keepClear: Uint8Array;
  /** Plate id per column; -1 off the plate grid. */
  readonly plate: Int32Array;
  readonly routes: PlatformRoute[] = [];
  readonly pads: PlatformPad[] = [];

  // ===========================================
  // Construction
  // ===========================================

  /** An all-void board of the given size. */
  constructor(board: MapDimensions) {
    this.width = board.width;
    this.depth = board.depth;
    const n = board.width * board.depth;
    this.level = new Int16Array(n);
    this.surface = Array.from({ length: n }, () => SurfaceIds.VOID);
    this.deck = new Uint8Array(n);
    this.route = new Uint8Array(n);
    this.podBeds = new Uint8Array(n);
    this.keepClear = new Uint8Array(n);
    this.plate = new Int32Array(n).fill(-1);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** True when the column is on the board. */
  inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.width && z < this.depth;
  }

  /** Row-major index of an on-board column. */
  indexOf(x: number, z: number): number {
    return z * this.width + x;
  }

  /** Makes the column deck at `level` with `surface`. */
  setDeck(x: number, z: number, level: number, surface: SurfaceId): void {
    if (!this.inBounds(x, z)) return;
    const i = this.indexOf(x, z);
    this.deck[i] = 1;
    this.level[i] = level;
    this.surface[i] = surface;
  }

  /** Returns the column to void: level 0, nothing on it. */
  setVoid(x: number, z: number): void {
    if (!this.inBounds(x, z)) return;
    const i = this.indexOf(x, z);
    this.deck[i] = 0;
    this.level[i] = 0;
    this.surface[i] = SurfaceIds.VOID;
    this.route[i] = 0;
    this.podBeds[i] = 0;
  }

  /** True when the column is deck. */
  isDeck(x: number, z: number): boolean {
    return this.inBounds(x, z) && this.deck[this.indexOf(x, z)] === 1;
  }

  /** Visits every on-board column within `radius` of the centre (centre-to-centre). */
  forEachWithin(
    centre: ColumnCoord,
    radius: number,
    visit: (x: number, z: number) => void,
  ): void {
    const r = Math.ceil(radius);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const x = centre.x + dx;
        const z = centre.z + dz;
        if (this.inBounds(x, z)) visit(x, z);
      }
    }
  }

  /** Visits the columns of a square by its lowest corner. */
  forEachInSquare(
    x0: number,
    z0: number,
    size: number,
    visit: (x: number, z: number) => void,
  ): void {
    for (let z = z0; z < z0 + size; z++) {
      for (let x = x0; x < x0 + size; x++) {
        if (this.inBounds(x, z)) visit(x, z);
      }
    }
  }

  /**
   * Lays a main route: every deck column within `radius + 0.5` of the
   * path is levelled to `level` and marked route; the route is recorded.
   */
  layRoute(route: PlatformRoute, radius: number, level: number): void {
    for (const column of route.path) {
      this.forEachWithin(column, radius + 0.5, (x, z) => {
        if (!this.isDeck(x, z)) return;
        const i = this.indexOf(x, z);
        this.level[i] = level;
        this.route[i] = 1;
      });
    }
    this.routes.push(route);
  }

  /**
   * Levels a square pad, paints it, keeps it and a one-column apron clear
   * of props and records it for the pad placer.
   */
  layPad(pad: PlatformPad, surface: SurfaceId): void {
    this.forEachInSquare(pad.x - 1, pad.z - 1, pad.size + 2, (x, z) => {
      if (this.isDeck(x, z)) this.keepClear[this.indexOf(x, z)] = 1;
    });
    this.forEachInSquare(pad.x, pad.z, pad.size, (x, z) => {
      this.setDeck(x, z, pad.level, surface);
    });
    this.pads.push(pad);
  }

  /**
   * Deck columns reached from `start` over deck, stepping at most one
   * layer at a time: the ground every class walks without a connector.
   */
  floodDeck(start: ColumnCoord): Uint8Array {
    const reached = new Uint8Array(this.width * this.depth);
    if (!this.isDeck(start.x, start.z)) return reached;
    const first = this.indexOf(start.x, start.z);
    reached[first] = 1;
    const queue = [first];
    // The queue grows as it is walked; for-of sees every pushed column.
    for (const u of queue) {
      const ux = u % this.width;
      const uz = Math.floor(u / this.width);
      for (const [dx, dz] of NEIGHBOURS_4) {
        const x = ux + dx;
        const z = uz + dz;
        if (!this.isDeck(x, z)) continue;
        const v = this.indexOf(x, z);
        if (reached[v] === 1) continue;
        if (Math.abs((this.level[v] ?? 0) - (this.level[u] ?? 0)) > 1) continue;
        reached[v] = 1;
        queue.push(v);
      }
    }
    return reached;
  }

  /** Deck columns with a void neighbour among the eight round them. */
  isRim(x: number, z: number): boolean {
    if (!this.isDeck(x, z)) return false;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx !== 0 || dz !== 0) && !this.isDeck(x + dx, z + dz)) {
          // The board's edge is not a rim: the deck runs on past it.
          if (this.inBounds(x + dx, z + dz)) return true;
        }
      }
    }
    return false;
  }
}

// ===========================================
// Plates
// ===========================================

/** One hull plate: raised or not, walnut or chestnut. */
export interface Plate {
  readonly centre: ColumnCoord;
  readonly raised: boolean;
  readonly dark: boolean;
}

/**
 * Grows hull plates from a jittered grid: every column belongs to its
 * nearest plate centre, so plates meet along straight-ish seams, and each
 * plate draws whether it is raised one layer and which chitin it is.
 */
export function growPlates(
  raster: PlatformRaster,
  tuning: SporePlatformTuning,
  rng: Rng,
): Plate[] {
  const spacing = tuning.plateSpacing;
  const across = Math.ceil(raster.width / spacing) + 1;
  const down = Math.ceil(raster.depth / spacing) + 1;
  const plates: Plate[] = [];
  for (let gz = 0; gz < down; gz++) {
    for (let gx = 0; gx < across; gx++) {
      plates.push({
        centre: {
          x: Math.floor((gx + rng.next()) * spacing),
          z: Math.floor((gz + rng.next()) * spacing),
        },
        raised: rng.chance(tuning.raisedPlateShare),
        dark: rng.chance(tuning.darkPlateShare),
      });
    }
  }
  for (let z = 0; z < raster.depth; z++) {
    for (let x = 0; x < raster.width; x++) {
      const gx = Math.floor(x / spacing);
      const gz = Math.floor(z / spacing);
      let best = -1;
      let bestDistance = Infinity;
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox;
          const cz = gz + oz;
          if (cx < 0 || cz < 0 || cx >= across || cz >= down) continue;
          const id = cz * across + cx;
          const centre = plates[id]?.centre;
          if (centre === undefined) continue;
          const distance = (centre.x - x) ** 2 + (centre.z - z) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = id;
          }
        }
      }
      raster.plate[raster.indexOf(x, z)] = best;
    }
  }
  return plates;
}

/** The chitin surface of a plate. */
export function plateSurface(plate: Plate | undefined): SurfaceId {
  return plate?.dark === true
    ? SurfaceIds.HULL_PLATE_DARK
    : SurfaceIds.HULL_PLATE;
}

// ===========================================
// Paths
// ===========================================

/**
 * A four-connected column path from `from` to `to`, stepping along the
 * longer axis and sideways as the line drifts, so a brush laid along it
 * leaves no diagonal pinch.
 */
export function linePath(from: ColumnCoord, to: ColumnCoord): ColumnCoord[] {
  const path: ColumnCoord[] = [{ ...from }];
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  let last = { ...from };
  for (let s = 1; s <= steps; s++) {
    const next = {
      x: Math.round(from.x + (dx * s) / steps),
      z: Math.round(from.z + (dz * s) / steps),
    };
    if (next.x !== last.x && next.z !== last.z) {
      path.push({ x: next.x, z: last.z });
    }
    if (next.x !== last.x || next.z !== last.z) path.push(next);
    last = next;
  }
  return path;
}

/** Joins waypoints with `linePath`, dropping the repeated joints. */
export function polylinePath(points: readonly ColumnCoord[]): ColumnCoord[] {
  const path: ColumnCoord[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const leg = linePath(points[i]!, points[i + 1]!);
    path.push(...(i === 0 ? leg : leg.slice(1)));
  }
  return points.length === 1 ? [{ ...points[0]! }] : path;
}
