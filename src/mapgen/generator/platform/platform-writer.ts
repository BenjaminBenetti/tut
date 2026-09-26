import type { MapDraft } from "../../model/map-draft";
import type {
  PlatformLayout,
  PlatformStage,
} from "../../model/platform-layout";
import type { ColumnCoord } from "../../model/road";
import type { PlatformRaster } from "./platform-raster";

// ===========================================
// Platform writer
// ===========================================

/** The core chamber's outline, which only the second stage has. */
export interface ChamberOutline {
  readonly chamber: Uint8Array;
  readonly centre: ColumnCoord;
  readonly radius: number;
}

/**
 * Writes a shaped platform stage onto the draft (#1179): every column's
 * level (as ground and natural level) and surface, then the layout the
 * later passes read. Returns the layout it recorded.
 */
export function writePlatform(
  draft: MapDraft,
  raster: PlatformRaster,
  stage: PlatformStage,
  outline?: ChamberOutline,
): PlatformLayout {
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const i = raster.indexOf(x, z);
      const level = raster.level[i] ?? 0;
      draft.setGroundLevel(x, z, level);
      draft.setNaturalLevel(x, z, level);
      const surface = raster.surface[i];
      if (surface !== undefined) draft.setGroundSurface(x, z, surface);
    }
  }
  const layout: PlatformLayout = {
    stage,
    deck: raster.deck,
    route: raster.route,
    routes: raster.routes,
    podBeds: raster.podBeds,
    keepClear: raster.keepClear,
    pads: raster.pads,
    ...(outline === undefined
      ? {}
      : {
          chamber: outline.chamber,
          chamberCentre: outline.centre,
          chamberRadius: outline.radius,
        }),
  };
  draft.platform = layout;
  return layout;
}

/** Counts the deck columns of a layout. */
export function deckColumns(layout: PlatformLayout): number {
  let count = 0;
  for (const value of layout.deck) count += value;
  return count;
}
