import type { Camera } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { UnitId } from "../../tactical/model/unit";

/**
 * Hit-tests and highlights tactical units. The tactical scene builder
 * implements it; the picking controller and the tactical screen depend
 * on this interface, never on the concrete scene.
 */
export interface UnitPicker {
  /** The unit under a normalised device coordinate, or undefined. */
  pickUnit(ndc: Vec2, camera: Camera): UnitId | undefined;

  /** Highlights one unit as hovered, or none. */
  setHovered(unitId: UnitId | undefined): void;

  /** Marks one unit as selected, or none. */
  setSelected(unitId: UnitId | undefined): void;

  /** A world point at a unit's feet, or undefined for an unknown unit. */
  unitWorldPosition(unitId: UnitId): Vec3 | undefined;
}
