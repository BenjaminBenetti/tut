import type { UnitMotionTuning } from "../model/unit-motion";

/** Readable rigid-piece strides and attacks at tactical camera scale. */
export const UNIT_MOTION_TUNING: UnitMotionTuning = {
  mechWalkCyclesPerTile: 0.5,
  bodyLift: 0.018,
  bodyRoll: 0.018,
  bugRoll: 0.045,
  legSwing: 0.28,
  swarmerLegSwing: 0.5,
  footLift: 0.055,
  figureLift: 0.035,
  figureLean: 0.045,
  figureRoll: 0.035,
  armSwing: 0.09,
  strikePeak: 0.35,
  recoilPeak: 0.18,
  lunge: 0.2,
  recoil: 0.07,
  strikeLean: 0.12,
  recoilLean: 0.045,
  strikeSwing: 0.85,
  weaponKick: 0.1,
  strikeTwist: 0.22,
  weaponRecoil: 0.065,
  figureRecoil: 0.08,
};
