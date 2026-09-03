// ===========================================
// Outcome kinds
// ===========================================

/**
 * How a campaign can end (GDD §5.3). `defeat` is Earth overrun: global
 * threat reached its maximum. `victory-stub` stands in for the M4 final
 * mission: every city is clean and no hive remains, so the campaign
 * shows a victory screen instead of launching the space platform assault.
 */
export type GameOutcomeKind = "defeat" | "victory-stub";

/** Runtime list of every `GameOutcomeKind`, for validation and tests. */
export const GAME_OUTCOME_KINDS = [
  "defeat",
  "victory-stub",
] as const satisfies readonly GameOutcomeKind[];

/** Narrows an arbitrary string (from a save file, say) to a `GameOutcomeKind`. */
export function isGameOutcomeKind(value: string): value is GameOutcomeKind {
  return (GAME_OUTCOME_KINDS as readonly string[]).includes(value);
}

// ===========================================
// Summary
// ===========================================

/**
 * Campaign statistics frozen at the moment it ended, for the end screen.
 * Every value is derived from state when the outcome is set, so the
 * summary never drifts from the save it sits in.
 */
export interface GameOutcomeSummary {
  /** Cities at maximum infestation when the campaign ended. */
  readonly citiesLost: number;
  /** Cities with any infestation when the campaign ended. */
  readonly citiesInfested: number;
  /** Cities on the map, so the two counts above can be shown as fractions. */
  readonly citiesTotal: number;
  /** Missions the player completed, counted from mission rewards in the ledger. */
  readonly missionsRun: number;
  /** The day the campaign ended on; also the number of days played. */
  readonly daysSurvived: number;
  /** Global threat when the campaign ended, in the threat range. */
  readonly finalThreat: number;
}

// ===========================================
// Outcome
// ===========================================

/**
 * The record written to `OverworldState.outcome` once and never
 * overwritten. Its presence is what stops further simulation: the
 * `AdvanceDay` handler (#68) refuses to run once it is set.
 *
 * ```
 *   tick ──► evaluateOutcome ──► undefined      keep playing
 *                            └─► GameOutcome    outcome stored, GameEnded emitted
 * ```
 */
export interface GameOutcome {
  readonly kind: GameOutcomeKind;
  /** The overworld day the condition was first met. */
  readonly day: number;
  readonly summary: GameOutcomeSummary;
}
