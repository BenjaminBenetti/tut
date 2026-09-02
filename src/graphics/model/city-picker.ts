import type { Camera } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { CityId } from "../../overworld/model/city";

/**
 * What a pointer controller needs from the map scene: hit-testing and
 * highlight state. Keeps the controller independent of how the scene is
 * built, so it can be driven by a fake in tests.
 */
export interface CityPicker {
  /**
   * Returns the city whose marker is under a normalised device
   * coordinate (`x`, `y` in `[-1, 1]`, `+y` up) as seen by `camera`.
   */
  pickCity(ndc: Vec2, camera: Camera): CityId | undefined;
  /** Highlights one marker as hovered, or none. */
  setHovered(cityId: CityId | undefined): void;
  /** Marks one marker as selected, or none. */
  setSelected(cityId: CityId | undefined): void;
  /** World position of a city's marker, for projecting to the screen. */
  markerWorldPosition(cityId: CityId): Vec3 | undefined;
}
