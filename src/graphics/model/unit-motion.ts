/** Presentation poses, independent of the unit's tactical position and facing. */
export interface UnitMotion {
  /** Samples a stride in tile units; zero and whole strides are grounded. */
  walk(strides: number): void;
  /** Samples a firing recoil or melee swing from rest (0) back to rest (1). */
  attack(progress: number, melee: boolean): void;
  /** Restores every animated part after completion, skipping or disposal. */
  reset(): void;
}

/** Pose amplitudes in radians and world units, shared by the unit animation rig. */
export interface UnitMotionTuning {
  readonly bodyLift: number;
  readonly bodyRoll: number;
  readonly bugRoll: number;
  readonly legSwing: number;
  readonly swarmerLegSwing: number;
  readonly footLift: number;
  readonly figureLift: number;
  readonly figureLean: number;
  readonly figureRoll: number;
  readonly armSwing: number;
  readonly strikePeak: number;
  readonly recoilPeak: number;
  readonly lunge: number;
  readonly recoil: number;
  readonly strikeLean: number;
  readonly recoilLean: number;
  readonly strikeSwing: number;
  readonly weaponKick: number;
  readonly strikeTwist: number;
  readonly weaponRecoil: number;
  readonly figureRecoil: number;
}
