import type { Camera } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { DeployableId } from "../../overworld/model/deployable";

/**
 * What a pointer controller needs from the map scene to pick the built
 * installations (#1155): hit-testing their models and highlight state.
 * Sits beside `CityPicker` and `RegionPicker`; the scene implements all
 * three, and the overworld adapter asks them in turn.
 */
export interface InstallationPicker {
  /**
   * Returns the installation whose model is under a normalised device
   * coordinate (`x`, `y` in `[-1, 1]`, `+y` up) as seen by `camera`, or
   * `undefined` when none is.
   */
  pickInstallation(ndc: Vec2, camera: Camera): DeployableId | undefined;
  /** Lifts one installation as hovered, or none. */
  setHoveredInstallation(id: DeployableId | undefined): void;
  /** Marks one installation as selected, or none. */
  setSelectedInstallation(id: DeployableId | undefined): void;
  /** World position of an installation, for projecting to the screen. */
  installationWorldPosition(id: DeployableId): Vec3 | undefined;
}
