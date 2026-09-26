import type { ActId } from "../../content/model/act-id";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { NemesisId } from "./nemesis";

// ===========================================
// Records
// ===========================================

/**
 * One act begun, written the moment the story spine enters it (campaign
 * arc §3). Act I is never recorded: every campaign begins it on
 * `FIRST_DAY` before its first mission (`createInitialCampaignProgress`),
 * so the chronicle starts with Act II.
 */
export interface ActStartRecord {
  /** The act entered. */
  readonly act: ActId;
  /** The overworld day it was entered on. */
  readonly day: number;
  /** `missionsPlayed` at that moment: the missions before this act. */
  readonly missionsPlayed: number;
}

/**
 * One story mission won, written when it resolves (campaign arc §6.9).
 * Repeats are kept: the three Great Hives share one story id and each
 * win is its own entry.
 */
export interface StoryWinRecord {
  /** The story mission won. */
  readonly storyId: StoryMissionId;
  /** The act it was won in, before any act its win opened. */
  readonly act: ActId;
  /** The overworld day it was played on. */
  readonly day: number;
}

/**
 * One nemesis killed (campaign arc §6.8): the named enemy leaves
 * `CampaignProgress.nemeses` and this entry keeps its name for the end
 * screen.
 */
export interface NemesisKillRecord {
  /** The nemesis's stable id. */
  readonly id: NemesisId;
  /** Its name, e.g. "Old Scald". */
  readonly name: string;
  /** What it was. */
  readonly speciesId: BugSpeciesId;
  /** The overworld day it died on. */
  readonly day: number;
}

// ===========================================
// Chronicle
// ===========================================

/**
 * What the campaign wrote down as it happened, for the end screen
 * (campaign arc §13 "the victory screen"): each act's start, each story
 * mission won and each nemesis killed, in order. Plain serializable
 * data inside `CampaignProgress.chronicle`, appended to and never
 * rewritten.
 *
 * ```
 *   CampaignChronicle
 *   ├── acts[]           Act II onwards, as the spine enters each   ── story service
 *   ├── storyWins[]      every story mission won, with its act/day  ── story service
 *   └── nemesesKilled[]  named enemies killed after they escaped    ── nemesis kill rule
 * ```
 *
 * The outcome service reads it once, when the campaign ends, into the
 * frozen `GameOutcomeSummary`. A campaign saved before the chronicle
 * existed has none, and its end screen shows the plain numbers.
 */
export interface CampaignChronicle {
  /** Acts entered after Act I, in the order entered. */
  readonly acts: readonly ActStartRecord[];
  /** Story missions won, in the order won; repeats kept. */
  readonly storyWins: readonly StoryWinRecord[];
  /** Nemeses killed, in the order killed. */
  readonly nemesesKilled: readonly NemesisKillRecord[];
}
