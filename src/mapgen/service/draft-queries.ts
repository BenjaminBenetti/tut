import { SurfaceIds } from "../data/surfaces";
import type { MapDraft } from "../model/map-draft";

// ===========================================
// Draft queries
// ===========================================

/**
 * Column predicates every pass asks of the draft. Kept in one place so
 * "passable ground" means the same thing to ramps, props and placers.
 */

/** On the map, not under a building, not water, no prop on the ground. */
export function isPassableGround(
  draft: MapDraft,
  x: number,
  z: number,
): boolean {
  return (
    draft.inBounds(x, z) &&
    !draft.isCovered(x, z) &&
    draft.groundSurfaceAt(x, z) !== SurfaceIds.WATER &&
    draft.propAt(draft.groundCoord(x, z)) === undefined
  );
}

/** Passable ground that is neither road nor sidewalk. */
export function isOpenGround(draft: MapDraft, x: number, z: number): boolean {
  return (
    isPassableGround(draft, x, z) &&
    !draft.isRoad(x, z) &&
    draft.groundSurfaceAt(x, z) !== SurfaceIds.SIDEWALK
  );
}

/** Road check tolerant of off-map coordinates. */
export function isRoadAt(draft: MapDraft, x: number, z: number): boolean {
  return draft.inBounds(x, z) && draft.isRoad(x, z);
}

/** True on the outermost ring of columns. */
export function isBoundaryColumn(
  draft: MapDraft,
  x: number,
  z: number,
): boolean {
  return x === 0 || z === 0 || x === draft.width - 1 || z === draft.depth - 1;
}

/** Packs a column into an integer key. */
export function columnKey(draft: MapDraft, x: number, z: number): number {
  return z * draft.width + x;
}
