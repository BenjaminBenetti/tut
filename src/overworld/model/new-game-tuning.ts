/** An inclusive integer range `[min, max]`. */
export interface InclusiveRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Balance knobs for how a campaign opens. The overworld factory receives
 * a tuning object rather than importing the defaults, so tests and
 * future difficulty settings can substitute their own. Defaults live in
 * `overworld/data/new-game-tuning.ts`.
 */
export interface NewGameTuning {
  /** How many distinct cities start infested; drawn once from this range. */
  readonly infestedCities: InclusiveRange;
  /** Starting infestation of each seeded city; drawn once per city. */
  readonly initialInfestation: InclusiveRange;
}
