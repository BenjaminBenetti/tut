import type { Object3D } from "three";

import type { UnitTemplate } from "../../tactical/model/unit-template";

/**
 * Resolves a unit template to the scene object that draws one unit of
 * it. The scene builder depends on this rather than on the model loader
 * directly, so a template can name one model or describe a mech to
 * assemble from parts (#1115) without the builder knowing which.
 */
export interface UnitModelSource {
  /**
   * Returns a fresh object the caller owns and places, pivoting at the
   * base centre like every unit model (style guide §6). Never rejects
   * for a registered template: a missing part or model draws a
   * placeholder instead.
   */
  load(template: UnitTemplate): Promise<Object3D>;
}
