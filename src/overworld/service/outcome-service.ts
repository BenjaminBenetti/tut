import type { Applied } from "../../core/model/domain-event";
import type { Transaction } from "../../economy/model/transaction";
import type { CampaignState } from "../model/campaign-state";
import type { CampaignProgress } from "../model/campaign-progress";
import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
import type {
  GameOutcome,
  GameOutcomeCause,
  GameOutcomeKind,
  GameOutcomeSummary,
} from "../model/game-outcome";
import type { GameEndedEvent } from "../model/overworld-domain-event";
import { GAME_ENDED } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import { MAX_THREAT } from "../model/threat";
import { hasFlag } from "./campaign-progress-service";

// ===========================================
// Conditions
// ===========================================

/** True when global threat has reached the defeat threshold (GDD §5.3). */
export function isDefeat(overworld: OverworldState): boolean {
  return overworld.threat >= MAX_THREAT;
}

/**
 * True when the story spine has been won (campaign arc D1, ADR 0013
 * §2.5): the story service set `campaign-won` when the gate mission of
 * the last act that exists fell. The only way to win; the retired stub
 * ("every city clean, no hive") no longer ends anything.
 */
export function isStoryVictory(progress: CampaignProgress): boolean {
  return hasFlag(progress, "campaign-won");
}

/**
 * True when the story has been lost (campaign arc D7): the story service
 * set `campaign-lost` when the Spore Platform assault failed a second
 * time.
 */
export function isStoryDefeat(progress: CampaignProgress): boolean {
  return hasFlag(progress, "campaign-lost");
}

// ===========================================
// Evaluation
// ===========================================

/**
 * The outcome the campaign is in, if any. Sticky: an outcome already
 * stored on the state is returned as is, so nothing downstream can
 * flip a defeat into a victory or restamp the day. Otherwise the story's
 * verdicts come first, because they record a mission already played
 * before this tick, and threat is checked last:
 *
 * ```
 *   outcome set? ───────────yes──► that outcome
 *        │no
 *   flag campaign-lost? ────yes──► defeat   (cause story, D7)
 *        │no
 *   flag campaign-won? ─────yes──► victory  (cause story, D1)
 *        │no
 *   threat ≥ 100? ──────────yes──► defeat   (cause threat)
 *        │no
 *   undefined
 * ```
 *
 * A clean Earth with no hive is no longer a victory: `victory-stub` is
 * never produced (ADR 0013 §2.5).
 */
export function evaluateOutcome(state: CampaignState): GameOutcome | undefined {
  const { overworld } = state;
  if (overworld.outcome !== undefined) {
    return overworld.outcome;
  }
  const ended = (
    kind: GameOutcomeKind,
    cause: GameOutcomeCause,
  ): GameOutcome => ({
    kind,
    cause,
    day: overworld.day,
    summary: summarise(state),
  });
  if (isStoryDefeat(overworld.progress)) {
    return ended("defeat", "story");
  }
  if (isStoryVictory(overworld.progress)) {
    return ended("victory", "story");
  }
  if (isDefeat(overworld)) {
    return ended("defeat", "threat");
  }
  return undefined;
}

/**
 * Stores the outcome on the state the first time a condition is met and
 * emits `GameEnded` once. Runs last in the day tick. When the campaign
 * has already ended, or has not ended yet, the state is returned
 * untouched and no event is emitted, so the stored outcome is never
 * overwritten.
 */
export function applyOutcome<TState extends CampaignState>(
  state: TState,
): Applied<TState, GameEndedEvent> {
  if (state.overworld.outcome !== undefined) {
    return { state, events: [] };
  }
  const outcome = evaluateOutcome(state);
  if (outcome === undefined) {
    return { state, events: [] };
  }
  return {
    state: { ...state, overworld: { ...state.overworld, outcome } },
    events: [{ type: GAME_ENDED, payload: { outcome } }],
  };
}

// ===========================================
// Summary
// ===========================================

/** Freezes the end-screen statistics from the current state. */
export function summarise(state: CampaignState): GameOutcomeSummary {
  const { overworld, economy } = state;
  const cities = overworld.map.cities;
  return {
    citiesLost: cities.filter((c) => c.infestation >= MAX_INFESTATION).length,
    citiesInfested: cities.filter((c) => c.infestation > MIN_INFESTATION)
      .length,
    citiesTotal: cities.length,
    missionsRun: countMissionsRun(economy.ledger),
    daysSurvived: overworld.day,
    finalThreat: overworld.threat,
  };
}

/**
 * Missions completed, read off the ledger: one `reward` entry is written
 * per resolved mission with the mission id as `ref`, so distinct refs
 * count missions without a separate counter on the state.
 */
function countMissionsRun(ledger: readonly Transaction[]): number {
  const missions = new Set<string>();
  for (const entry of ledger) {
    if (entry.kind === "reward") {
      missions.add(entry.ref);
    }
  }
  return missions.size;
}
