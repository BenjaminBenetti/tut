import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import type { CampaignProgress } from "../model/campaign-progress";
import type { MissionOutcome } from "../model/mission-result";

// ===========================================
// Queries
// ===========================================

/**
 * Missions resolved since the current act began (arc §3: "debuts within
 * an act count missions played in that act"). Never negative.
 */
export function missionsInAct(progress: CampaignProgress): number {
  return Math.max(0, progress.missionsPlayed - progress.actStartedAt);
}

/** Whether the campaign has earned `flag`. */
export function hasFlag(
  progress: CampaignProgress,
  flag: CampaignFlagId,
): boolean {
  return progress.flags.includes(flag);
}

// ===========================================
// Updates
// ===========================================

/**
 * Moves the campaign on to act `to`, starting its mission count now:
 * `actStartedAt` becomes the current `missionsPlayed`, so
 * `missionsInAct` reads 0 until the next mission resolves. Advancing to
 * the act already being played changes nothing and returns `progress`
 * itself, so the act's count is never restarted by a repeated trigger.
 *
 * ```
 *   { act: "act-1", actStartedAt: 0, missionsPlayed: 12 }
 *     ── advanceAct(·, "act-2") ──► { act: "act-2", actStartedAt: 12, missionsPlayed: 12 }
 * ```
 *
 * @throws {RangeError} if `to` comes before the current act in
 *   `ACT_IDS`: acts only move forward, so a backward step is a
 *   programmer error in the calling story rule.
 */
export function advanceAct(
  progress: CampaignProgress,
  to: ActId,
): CampaignProgress {
  if (to === progress.act) {
    return progress;
  }
  if (ACT_IDS.indexOf(to) < ACT_IDS.indexOf(progress.act)) {
    throw new RangeError(
      `Cannot move the campaign back from "${progress.act}" to "${to}"`,
    );
  }
  return { ...progress, act: to, actStartedAt: progress.missionsPlayed };
}

/**
 * Records `flag` as earned. A flag already held is not repeated, and
 * `progress` itself is returned, so setting a flag twice is harmless.
 */
export function withFlag(
  progress: CampaignProgress,
  flag: CampaignFlagId,
): CampaignProgress {
  if (hasFlag(progress, flag)) {
    return progress;
  }
  return { ...progress, flags: [...progress.flags, flag] };
}

/**
 * Counts one resolved mission (ADR 0013 §2.1): `missionsPlayed` goes up
 * for every outcome, `missionsWon` only for `won`, and each species in
 * `speciesKilled` the campaign had not killed before is appended to its
 * first-kill record, in the order given. Called by the launch handler
 * and nothing else.
 *
 * ```
 *   outcome ──► missionsPlayed + 1
 *          └─► won? ──► missionsWon + 1
 *   speciesKilled ──► new ones appended to progress.speciesKilled
 * ```
 */
export function recordMission(
  progress: CampaignProgress,
  outcome: MissionOutcome,
  speciesKilled: readonly BugSpeciesId[],
): CampaignProgress {
  return {
    ...progress,
    missionsPlayed: progress.missionsPlayed + 1,
    missionsWon: progress.missionsWon + (outcome === "won" ? 1 : 0),
    speciesKilled: mergeFirstKills(progress.speciesKilled, speciesKilled),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * `known` with every species of `killed` it lacks appended once, in
 * order. Returns `known` itself when nothing is new.
 */
function mergeFirstKills(
  known: readonly BugSpeciesId[],
  killed: readonly BugSpeciesId[],
): readonly BugSpeciesId[] {
  const merged = [...known];
  for (const species of killed) {
    if (!merged.includes(species)) {
      merged.push(species);
    }
  }
  return merged.length === known.length ? known : merged;
}
