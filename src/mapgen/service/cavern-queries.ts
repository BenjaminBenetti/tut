import type { CavernChamber } from "../model/cavern-layout";
import type { MapDraft } from "../model/map-draft";
import type { TileCoord } from "../model/tile-coord";

// ===========================================
// Cavern queries
// ===========================================

/**
 * The chamber a column belongs to, or undefined for tunnels, rock,
 * off-map columns and drafts that are not hive caverns.
 */
export function chamberAt(
  draft: MapDraft,
  x: number,
  z: number,
): CavernChamber | undefined {
  const layout = draft.cavern;
  if (layout === undefined || !draft.inBounds(x, z)) return undefined;
  return layout.chambers[layout.chamberOf[z * draft.width + x] ?? -1];
}

/**
 * True on the hive core's pad or within `ring` columns of it (Chebyshev),
 * false on drafts that are not hive caverns.
 */
export function nearCorePad(
  draft: MapDraft,
  x: number,
  z: number,
  ring = 0,
): boolean {
  const pad = draft.cavern?.corePad;
  if (pad === undefined) return false;
  return (
    x >= pad.x - ring &&
    x < pad.x + pad.size + ring &&
    z >= pad.z - ring &&
    z < pad.z + pad.size + ring
  );
}

/**
 * Where a hive cavern breeds: floor inside a chamber other than the
 * mouth, off the core's pad. Egg spawners are kept to it so they sit in
 * chambers rather than tunnels or beside the drop ship (#1179). Every
 * tile qualifies on a draft that is not a hive cavern.
 */
export function isBroodFloor(draft: MapDraft, coord: TileCoord): boolean {
  if (draft.cavern === undefined) return true;
  const chamber = chamberAt(draft, coord.x, coord.z);
  return (
    chamber !== undefined &&
    chamber.role !== "mouth" &&
    !nearCorePad(draft, coord.x, coord.z)
  );
}
