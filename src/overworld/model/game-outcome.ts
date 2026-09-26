import type {
  ChronicleAct,
  ChronicleStoryWin,
  NemesisFate,
  SquadRollEntry,
} from "./outcome-chronicle";

// ===========================================
// Outcome kinds
// ===========================================

/**
 * How a campaign can end (GDD §5.3, campaign arc D1, ADR 0013 §2.5).
 *
 * | Kind           | Meaning                                                    |
 * |----------------|------------------------------------------------------------|
 * | `defeat`       | threat reached its maximum, or the story was lost (D7)     |
 * | `victory`      | the story spine was won: its last act's gate mission fell  |
 * | `victory-stub` | retired: "every city clean, no hive"; old saves only       |
 *
 * `victory-stub` stays in the union so a save that ended that way still
 * loads and shows its screen, but nothing produces it any more.
 */
export type GameOutcomeKind = "defeat" | "victory" | "victory-stub";

/** Runtime list of every `GameOutcomeKind`, for validation and tests. */
export const GAME_OUTCOME_KINDS = [
  "defeat",
  "victory",
  "victory-stub",
] as const satisfies readonly GameOutcomeKind[];

/** Narrows an arbitrary string (from a save file, say) to a `GameOutcomeKind`. */
export function isGameOutcomeKind(value: string): value is GameOutcomeKind {
  return (GAME_OUTCOME_KINDS as readonly string[]).includes(value);
}

/**
 * What ended the campaign, beside its kind: `threat` when global threat
 * reached its maximum, `story` when the story spine reached a verdict
 * (the campaign was won, or the Spore Platform fell twice, D7). The end
 * screen words a defeat by it.
 */
export type GameOutcomeCause = "threat" | "story";

// ===========================================
// Summary
// ===========================================

/**
 * Campaign statistics frozen at the moment it ended, for the end screen.
 * Every value is derived from state when the outcome is set, so the
 * summary never drifts from the save it sits in.
 *
 * The chronicle fields (from `missionsPlayed` down) are optional: an
 * outcome saved before they existed has none and still renders, and an
 * act record that is not complete is left out rather than guessed.
 *
 * ```
 *   GameOutcomeSummary
 *   ├── citiesLost … finalThreat   the numbers, always present
 *   ├── missionsPlayed?, missionsWon?   from campaign progress
 *   ├── acts?              the timeline: each act's days, missions, ending
 *   ├── storyWins?         each story mission won, with act and day
 *   ├── nemeses?           killed on a day, or still out there
 *   ├── squad?             the mechs and squads that finished it
 *   └── platformAttempts?  1, or 2 when Last Hope was needed (arc D7)
 * ```
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
  /** Every resolved mission, won, extracted or lost (`CampaignProgress.missionsPlayed`). */
  readonly missionsPlayed?: number;
  /** The won ones (`CampaignProgress.missionsWon`). */
  readonly missionsWon?: number;
  /**
   * Every act the campaign reached, in order. Absent when the campaign
   * did not record each act's start (a save from before the chronicle).
   */
  readonly acts?: readonly ChronicleAct[];
  /** Story missions won, in order; absent without a chronicle. */
  readonly storyWins?: readonly ChronicleStoryWin[];
  /** Nemeses killed (in kill order), then those still out there. */
  readonly nemeses?: readonly NemesisFate[];
  /** The roster's mechs, then its squads, as they finished the campaign. */
  readonly squad?: readonly SquadRollEntry[];
  /**
   * Spore Platform assaults made: 1, or 2 when the first failed and Last
   * Hope brought it back (arc D7). Absent when the platform was never
   * assaulted.
   */
  readonly platformAttempts?: number;
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
  /**
   * What ended it. Absent on outcomes saved before the story spine: those
   * were a threat defeat or the retired victory stub.
   */
  readonly cause?: GameOutcomeCause;
  /** The overworld day the condition was first met. */
  readonly day: number;
  readonly summary: GameOutcomeSummary;
}
