import type { PointerCutawayTuning } from "../model/pointer-cutaway";

/** A deliberate inspection window; brief street sweeps do not open every roof (#947). */
export const POINTER_CUTAWAY_TUNING: PointerCutawayTuning = {
  radius: 3,
  dwellSeconds: 0.12,
  fadeSeconds: 0.15,
};
