/** Limits for large, solid colony buildings and their small terrain platforms. */
export interface CarapaceSiteTuning {
  readonly minimumLevel: number;
  readonly keepMinimumLevel: number;
  readonly clearance: number;
  readonly minimumPressure: number;
  readonly maximumGrading: number;
  readonly colonyShare: number;
  readonly centreSearchRadius: number;
}
