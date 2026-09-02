/**
 * Balance knobs for the economy. Services receive a tuning object rather
 * than importing the defaults, so tests and future difficulty settings
 * can substitute their own values. Defaults live in
 * `economy/data/economy-tuning.ts`.
 */
export interface EconomyTuning {
  /** Credits a new campaign begins with. */
  readonly startingCredits: number;
  /** Daily stipend paid when Earth is entirely unfested. */
  readonly baseStipend: number;
  /** Smallest daily stipend, paid even when Earth is nearly overrun. */
  readonly stipendFloor: number;
}
