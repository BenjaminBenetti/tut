import { projectEquirectangular } from "../../overworld/service/map-projection";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import type { GroundPolygon } from "./coastline-projection";
import { layoutToWorld } from "./overworld-layout";

// ===========================================
// Types
// ===========================================

/** Land split by whether a region may claim it. */
export interface ClaimableLand {
  /** Land the region territories divide between them. */
  readonly claimable: readonly GroundPolygon[];
  /** Land no region claims: drawn, but never bordered or filled. */
  readonly unclaimed: readonly GroundPolygon[];
}

// ===========================================
// Constants
// ===========================================

/**
 * Latitude below which land belongs to no region (#1149). Antarctica
 * has no cities and no infestation, so it is drawn as land but stays
 * out of the territory partition; a land mass lying wholly south of
 * this line is unclaimed.
 */
export const UNCLAIMED_SOUTH_OF_LATITUDE = -60;

// ===========================================
// Partition
// ===========================================

/**
 * Splits land masses into the ones regions may claim and the ones that
 * lie entirely south of `UNCLAIMED_SOUTH_OF_LATITUDE`. The cut is made
 * on the ground plane through the same projection the coast went
 * through, so it agrees with the drawn map.
 *
 * ```
 *   lat −60 ─────────────────────────   claimable above,
 *              ╭───────────────╮        Antarctica below
 *              ╰───────────────╯
 * ```
 *
 * @param polygons - Land masses on the ground plane.
 * @param config - Map plane size, to place the latitude line.
 * @returns The two lists, each in the input's order.
 */
export function partitionClaimableLand(
  polygons: readonly GroundPolygon[],
  config: OverworldSceneConfig,
): ClaimableLand {
  const cutoffZ = layoutToWorld(
    projectEquirectangular(UNCLAIMED_SOUTH_OF_LATITUDE, 0),
    config,
  ).z;
  const claimable: GroundPolygon[] = [];
  const unclaimed: GroundPolygon[] = [];
  for (const polygon of polygons) {
    const polar = polygon.outer.every((point) => point.z >= cutoffZ);
    (polar ? unclaimed : claimable).push(polygon);
  }
  return { claimable, unclaimed };
}
