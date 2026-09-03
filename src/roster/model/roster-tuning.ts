/**
 * Balance knobs for roster bookkeeping. Services receive a tuning object
 * rather than importing the defaults, so tests and future difficulty
 * settings can substitute their own values. Defaults live in
 * `roster/data/roster-tuning.ts`.
 */
export interface RosterTuning {
  /** Credits per point of `damage` removed when repairing a mech (GDD §5.7). */
  readonly repairCostPerPoint: number;
  /** Experience every squad and mech that returns from a mission earns. */
  readonly xpPerMissionSurvived: number;
}
