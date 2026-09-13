import type { Vec3 } from "../../core/model/grid";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { footprintCentre } from "../../tactical/service/footprint-service";
import { tileTop } from "../view/tactical-map-view";

// ===========================================
// Unit placement
// ===========================================

/**
 * Where a unit's feet are in world space when its footprint is anchored
 * at `anchor` (#1130): the anchor level's top, at the footprint's centre
 * on the ground plane. The one answer to "where does this unit stand",
 * shared by the mesh that poses it, the walk that moves it, the tether
 * that hangs under it and the camera that centres on it.
 *
 * ```
 *   size 1 at (x, z)      size 2 at (x, z)
 *
 *   ┌───┐                 ┌───┬───┐
 *   │ ● │ (x+½, z+½)      │   │   │
 *   └───┘                 ├───●───┤ (x+1, z+1)
 *                         │   │   │
 *                         └───┴───┘
 * ```
 *
 * For a one-tile unit this is `tileTopCentre(anchor)` exactly, so every
 * unit drawn before footprints stands where it always did.
 *
 * @param anchor - The footprint's anchor tile (`Unit.pos`).
 * @param size - Tiles per side of the footprint.
 * @returns The feet in world units.
 */
export function unitFeetAt(anchor: TileCoord, size: number): Vec3 {
  const centre = footprintCentre(anchor, size);
  return { x: centre.x, y: tileTop(anchor.y), z: centre.z };
}
