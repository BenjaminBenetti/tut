import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { RosterState } from "../../roster/model/roster-state";
import type {
  ActStartRecord,
  CampaignChronicle,
} from "../model/campaign-chronicle";
import type { CampaignProgress } from "../model/campaign-progress";
import type { CampaignState } from "../model/campaign-state";
import type {
  GameOutcomeKind,
  GameOutcomeSummary,
} from "../model/game-outcome";
import type {
  ChronicleAct,
  NemesisFate,
  SquadRollEntry,
} from "../model/outcome-chronicle";
import { FIRST_DAY } from "../model/overworld-state";
import { hasFlag } from "./campaign-progress-service";
import { chronicleOf } from "./campaign-chronicle-service";
import {
  CAMPAIGN_LOST_FLAG,
  isStoryWon,
  PLATFORM_FAILED_FLAG,
} from "./story-service";

// ===========================================
// Types
// ===========================================

/** The part of the frozen summary the chronicle fills. */
export type ChronicleSummary = Pick<
  GameOutcomeSummary,
  | "missionsPlayed"
  | "missionsWon"
  | "acts"
  | "storyWins"
  | "nemeses"
  | "squad"
  | "platformAttempts"
>;

// ===========================================
// Constants
// ===========================================

/** The finale's assault (arc §6.9): its win is the only first-attempt victory. */
const SPORE_PLATFORM: StoryMissionId = "spore-platform";

// ===========================================
// Summary
// ===========================================

/**
 * The chronicle half of the end screen's summary, read from the state at
 * the moment the campaign ends as `kind` (campaign arc §13 "the victory
 * screen"). Everything comes from records already on the state:
 *
 * ```
 *   progress.missionsPlayed/Won ─────────────► missionsPlayed, missionsWon
 *   Act I (day 1, 0 missions) + chronicle.acts ► acts        (only if every act is recorded)
 *   chronicle.storyWins ─────────────────────► storyWins     (only with a chronicle)
 *   chronicle.nemesesKilled + progress.nemeses ► nemeses     killed first, then the living
 *   roster.mechs + roster.squads ────────────► squad
 *   platform-failed, campaign-lost, spore-platform won ► platformAttempts (absent at 0)
 * ```
 *
 * @param state - The campaign as it ends.
 * @param kind - How it ended: a victory's last act was ended by its last story win.
 */
export function chronicleSummary(
  state: CampaignState,
  kind: GameOutcomeKind,
): ChronicleSummary {
  const { progress, day } = state.overworld;
  const chronicle = progress.chronicle;
  const acts = actsOf(progress, day, kind === "victory");
  const attempts = platformAttempts(progress);
  return {
    missionsPlayed: progress.missionsPlayed,
    missionsWon: progress.missionsWon,
    ...(acts === undefined ? {} : { acts }),
    ...(chronicle === undefined ? {} : { storyWins: chronicle.storyWins }),
    nemeses: nemesisFates(progress),
    squad: rollOf(state.roster),
    ...(attempts === 0 ? {} : { platformAttempts: attempts }),
  };
}

/**
 * Spore Platform assaults made (arc D7): the first failure sets
 * `platform-failed`, the second sets `campaign-lost`, and a win records
 * the mission as won. 0 when the platform was never assaulted.
 */
export function platformAttempts(progress: CampaignProgress): number {
  return [
    hasFlag(progress, PLATFORM_FAILED_FLAG),
    hasFlag(progress, CAMPAIGN_LOST_FLAG),
    isStoryWon(progress, SPORE_PLATFORM),
  ].filter(Boolean).length;
}

// ===========================================
// Acts
// ===========================================

/**
 * Every act reached, with its span and ending, or `undefined` when the
 * record is not complete: each act from Act I to the current one must
 * have a start, in order. Act I's start is the campaign's own (day
 * `FIRST_DAY`, no missions); the rest were written as each act began.
 * An act ends where the next begins, or on `endDay`; it was ended by the
 * last story mission won in it, except the act a defeat ended.
 */
function actsOf(
  progress: CampaignProgress,
  endDay: number,
  won: boolean,
): readonly ChronicleAct[] | undefined {
  const chronicle = chronicleOf(progress);
  const starts: readonly ActStartRecord[] = [
    { act: ACT_IDS[0] ?? progress.act, day: FIRST_DAY, missionsPlayed: 0 },
    ...chronicle.acts,
  ];
  const reached = ACT_IDS.slice(0, ACT_IDS.indexOf(progress.act) + 1);
  const complete =
    starts.length === reached.length &&
    starts.every((start, n) => start.act === reached[n]);
  if (!complete) {
    return undefined;
  }
  return starts.map((start, n) => {
    const next = starts[n + 1];
    const endsAfter = next?.missionsPlayed ?? progress.missionsPlayed;
    const endedBy =
      next !== undefined || won
        ? lastStoryWinIn(chronicle, start.act)
        : undefined;
    return {
      act: start.act,
      fromDay: start.day,
      toDay: next?.day ?? endDay,
      missionsBefore: start.missionsPlayed,
      missions: Math.max(0, endsAfter - start.missionsPlayed),
      ...(endedBy === undefined ? {} : { endedBy }),
    };
  });
}

/** The last story mission won in `act`, if any. */
function lastStoryWinIn(
  chronicle: CampaignChronicle,
  act: ActId,
): StoryMissionId | undefined {
  return chronicle.storyWins.filter((win) => win.act === act).at(-1)?.storyId;
}

// ===========================================
// Nemeses and the squad
// ===========================================

/** Nemeses killed, in kill order, then those still out there, in record order. */
function nemesisFates(progress: CampaignProgress): readonly NemesisFate[] {
  const killed = chronicleOf(progress).nemesesKilled;
  const dead = new Set(killed.map((entry) => entry.id));
  return [
    ...killed.map(({ id, name, speciesId, day }) => ({
      id,
      name,
      speciesId,
      killedDay: day,
    })),
    ...progress.nemeses
      .filter((nemesis) => !dead.has(nemesis.id))
      .map(({ id, name, speciesId }) => ({ id, name, speciesId })),
  ];
}

/** The roster's mechs in build order, then its squads in hire order. */
function rollOf(roster: RosterState): readonly SquadRollEntry[] {
  return [
    ...roster.mechs.map((mech): SquadRollEntry => ({
      kind: "mech",
      id: mech.id,
      name: mech.name,
      kills: mech.kills,
      missionsSurvived: mech.missionsSurvived,
      xp: mech.xp,
    })),
    ...roster.squads.map((squad): SquadRollEntry => ({
      kind: "squad",
      id: squad.id,
      name: squad.name,
      kills: squad.kills,
      missionsSurvived: squad.missionsSurvived,
      xp: squad.xp,
    })),
  ];
}
