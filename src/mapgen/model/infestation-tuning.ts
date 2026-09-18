/** Proportions at level ten; lower levels scale them linearly. */
export interface InfestationTuning {
  readonly groundShare: number;
  readonly patchFrequency: number;
  readonly nestShare: number;
  readonly wallDamageShare: number;
  readonly roofDamageShare: number;
  readonly hookClearance: number;
}
