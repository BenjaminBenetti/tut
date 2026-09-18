/** Limits for open, modular colony formations. */
export interface CarapaceSiteTuning {
  readonly minimumLevel: number;
  readonly largeFormationLevel: number;
  readonly minimumSpan: number;
  readonly maximumSpan: number;
  readonly outlineAttempts: number;
  readonly maximumGateGrading: number;
  readonly minimumApproachPressure: number;
  readonly straightStyleThresholds: {
    readonly spine: number;
    readonly broken: number;
    readonly overlap: number;
    readonly ribbed: number;
  };
  readonly clearance: number;
  readonly minimumPressure: number;
  readonly colonyShare: number;
  readonly centreSearchRadius: number;
  readonly minimumModules: number;
  readonly minimumRunLength: number;
  readonly minimumRetainedShare: number;
}
