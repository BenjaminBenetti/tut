import type { Applied } from "../../core/model/domain-event";
import type { Transaction } from "../../economy/model/transaction";
import type { CampaignState } from "../model/campaign-state";
import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
import type { GameOutcome, GameOutcomeSummary } from "../model/game-outcome";
import type { GameEndedEvent } from "../model/overworld-domain-event";
import { GAME_ENDED } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import { MAX_THREAT } from "../model/threat";

// ===========================================
// Conditions
// ===========================================

/** True when global threat has reached its maximum: Earth overrun (GDD §5.3). */
export function isDefeat(overworld: OverworldState): boolean {
  return overworld.threat >= MAX_THREAT;
}

/**
 * True when every city is clean and no hive remains (GDD §5.3). Until M4
 * ships the final mission this is the victory stub.
 */
export function isVictory(overworld: OverworldState): boolean {
  return (
    overworld.hives.length === 0 &&
    overworld.map.cities.every((city) => city.infestation === MIN_INFESTATION)
  );
}

// ===========================================
// Evaluation
// ===========================================

/**
 * The outcome the campaign is in, if any. Sticky: an outcome already
 * stored on the state is returned as is, so nothing downstream can
 * flip a defeat into a victory or restamp the day. Otherwise defeat is
 * checked before victory, since a maxed threat means Earth is overrun
 * whatever the map says.
 *
 * ```
 *   outcome set? ──yes──► that outcome
 *        │no
 *   threat ≥ 100? ──yes──► defeat
 *        │no
 *   all clean, no hives? ──yes──► victory-stub
 *        │no
 *   undefined
 * ```
 */
export function evaluateOutcome(state: CampaignState): GameOutcome | undefined {
  const { overworld } = state;
  if (overworld.outcome !== undefined) {
    return overworld.outcome;
  }
  if (isDefeat(overworld)) {
    return { kind: "defeat", day: overworld.day, summary: summarise(state) };
  }
  if (isVictory(overworld)) {
    return {
      kind: "victory-stub",
      day: overworld.day,
      summary: summarise(state),
    };
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
