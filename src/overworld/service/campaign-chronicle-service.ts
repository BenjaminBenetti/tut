import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { CampaignChronicle } from "../model/campaign-chronicle";
import type { CampaignProgress } from "../model/campaign-progress";
import type { Nemesis } from "../model/nemesis";

// ===========================================
// Constants
// ===========================================

/** The chronicle a campaign has before anything is written in it. */
export const EMPTY_CHRONICLE: CampaignChronicle = {
  acts: [],
  storyWins: [],
  nemesesKilled: [],
};

// ===========================================
// Queries
// ===========================================

/** The campaign's chronicle, or `EMPTY_CHRONICLE` when nothing has been written. */
export function chronicleOf(progress: CampaignProgress): CampaignChronicle {
  return progress.chronicle ?? EMPTY_CHRONICLE;
}

// ===========================================
// Recording
// ===========================================

/**
 * Records that the act `progress` is now in began on `day`, after
 * `progress.missionsPlayed` missions. Called by the story service right
 * after `advanceAct`, so the entry is written as the act begins and
 * never reconstructed afterwards.
 *
 * ```
 *   { act: "act-2", missionsPlayed: 12, chronicle: { acts: [] } }
 *     ── chronicleActStart(·, 14) ──► acts: [{ act: "act-2", day: 14, missionsPlayed: 12 }]
 * ```
 *
 * An act already recorded is not recorded again, and `progress` itself
 * is returned, so a repeated advance never moves an act's start.
 */
export function chronicleActStart(
  progress: CampaignProgress,
  day: number,
): CampaignProgress {
  const chronicle = chronicleOf(progress);
  if (chronicle.acts.some((entry) => entry.act === progress.act)) {
    return progress;
  }
  return withChronicle(progress, {
    ...chronicle,
    acts: [
      ...chronicle.acts,
      { act: progress.act, day, missionsPlayed: progress.missionsPlayed },
    ],
  });
}

/**
 * Records that story mission `storyId` was won on `day`, in the act
 * `progress` is in. Called by the story service before the win's effects
 * run, so an act the win opens is not the act it is recorded in.
 * Every win is kept, repeats included: the three Great Hives share one
 * story id.
 */
export function chronicleStoryWin(
  progress: CampaignProgress,
  storyId: StoryMissionId,
  day: number,
): CampaignProgress {
  const chronicle = chronicleOf(progress);
  return withChronicle(progress, {
    ...chronicle,
    storyWins: [...chronicle.storyWins, { storyId, act: progress.act, day }],
  });
}

/**
 * Records that `nemesis` was killed on `day`, keeping its name for the
 * end screen once it leaves `progress.nemeses`. The hook for the rule
 * that removes a killed nemesis (Alpha Hunt, campaign arc §6.8); it does
 * not remove the nemesis itself. A nemesis already recorded as killed
 * is not recorded again, and `progress` itself is returned.
 */
export function chronicleNemesisKill(
  progress: CampaignProgress,
  nemesis: Nemesis,
  day: number,
): CampaignProgress {
  const chronicle = chronicleOf(progress);
  if (chronicle.nemesesKilled.some((entry) => entry.id === nemesis.id)) {
    return progress;
  }
  return withChronicle(progress, {
    ...chronicle,
    nemesesKilled: [
      ...chronicle.nemesesKilled,
      {
        id: nemesis.id,
        name: nemesis.name,
        speciesId: nemesis.speciesId,
        day,
      },
    ],
  });
}

// ===========================================
// Helpers
// ===========================================

/** `progress` with `chronicle` in place of its own. */
function withChronicle(
  progress: CampaignProgress,
  chronicle: CampaignChronicle,
): CampaignProgress {
  return { ...progress, chronicle };
}
