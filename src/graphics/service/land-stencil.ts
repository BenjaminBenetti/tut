import type { Material } from "three";
import {
  AlwaysStencilFunc,
  EqualStencilFunc,
  KeepStencilOp,
  ReplaceStencilOp,
} from "three";

// ===========================================
// Constants
// ===========================================

/** The stencil value the land fill leaves behind wherever it draws. */
export const LAND_STENCIL_REF = 1;

// ===========================================
// Stencil
// ===========================================

/**
 * Makes a material stamp `LAND_STENCIL_REF` into the stencil buffer
 * wherever it draws, so later materials can be clipped to land (#1149).
 * The renderer must be created with `stencil: true` for either half of
 * this to do anything.
 *
 * ```
 *   land fill ──writes 1──▶ stencil ◀──tests == 1── territory fill
 *                                                    region borders
 * ```
 *
 * @param material - The land fill's material; changed in place.
 */
export function writeLandStencil(material: Material): void {
  material.stencilWrite = true;
  material.stencilRef = LAND_STENCIL_REF;
  material.stencilFunc = AlwaysStencilFunc;
  material.stencilZPass = ReplaceStencilOp;
  material.stencilFail = KeepStencilOp;
  material.stencilZFail = KeepStencilOp;
}

/**
 * Makes a material draw only where the land fill has stamped the
 * stencil, without touching the stencil itself. three enables the
 * stencil test only when `stencilWrite` is set, so it is set with a
 * zero write mask.
 *
 * @param material - A material to clip to land; changed in place.
 */
export function testLandStencil(material: Material): void {
  material.stencilWrite = true;
  material.stencilWriteMask = 0;
  material.stencilRef = LAND_STENCIL_REF;
  material.stencilFunc = EqualStencilFunc;
  material.stencilZPass = KeepStencilOp;
  material.stencilFail = KeepStencilOp;
  material.stencilZFail = KeepStencilOp;
}

/** True when a material writes the land stencil value. */
export function writesLandStencil(material: Material): boolean {
  return (
    material.stencilWrite &&
    material.stencilRef === LAND_STENCIL_REF &&
    material.stencilZPass === ReplaceStencilOp &&
    material.stencilWriteMask !== 0
  );
}

/** True when a material is clipped to land and writes nothing back. */
export function testsLandStencil(material: Material): boolean {
  return (
    material.stencilWrite &&
    material.stencilWriteMask === 0 &&
    material.stencilRef === LAND_STENCIL_REF &&
    material.stencilFunc === EqualStencilFunc
  );
}
