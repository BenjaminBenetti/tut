import type { Camera } from "three";

import type { Vec2 } from "../../core/model/grid";
import type { RegionId } from "../../overworld/model/region";

/**
 * What a pointer controller needs from the map scene to pick regions
 * by their land (#1155): hit-testing the ground and highlight state.
 * Sits beside `CityPicker`, which picks the settlements standing on
 * that land; the scene implements both.
 */
export interface RegionPicker {
  /**
   * Returns the region whose land is under a normalised device
   * coordinate (`x`, `y` in `[-1, 1]`, `+y` up) as seen by `camera`,
   * or `undefined` over the sea, over unclaimed land or off the map.
   */
  pickRegion(ndc: Vec2, camera: Camera): RegionId | undefined;
  /** Outlines one region as hovered, or none. */
  setHoveredRegion(regionId: RegionId | undefined): void;
  /** Marks one region as selected on its own, or none. */
  setSelectedRegion(regionId: RegionId | undefined): void;
}
