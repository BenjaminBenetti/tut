import type { Camera } from "three";
import type { Vec2, Vec3 } from "../../core/model/grid";

/** A building and the inspection depth under the raw cursor ray. */
export interface PointerCutawayTarget {
  readonly buildingId: string;
  readonly centre: Vec3;
}

/** Graphics-only hit testing; independent of action selection and movement tiles. */
export interface PointerCutawayPicker {
  /** Changes when model loading or level visibility invalidates a cached pick. */
  readonly cutawayRevision: number;
  /** The foremost building surface under the cursor, or undefined on open ground. */
  pickCutaway(ndc: Vec2, camera: Camera): PointerCutawayTarget | undefined;
}

/** Art-owned pointer inspection parameters, separate from force visibility. */
export interface PointerCutawayTuning {
  readonly radius: number;
  readonly dwellSeconds: number;
  readonly fadeSeconds: number;
}
