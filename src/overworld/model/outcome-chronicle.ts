import type { ActId } from "../../content/model/act-id";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { NemesisId } from "./nemesis";

// ===========================================
// Acts
// ===========================================

/**
 * One act of an ended campaign, as the end screen's timeline shows it
 * (campaign arc §3): when it ran, in days and missions, and the story
 * mission that ended it.
 *
 * ```
 *   Act I · Emergence    days 1–14 · missions 1–12   ended by Live Specimen
 *     fromDay 1, toDay 14, missionsBefore 0, missions 12, endedBy "live-specimen"
 * ```
 */
export interface ChronicleAct {
  /** Which act. */
  readonly act: ActId;
  /** The day it began. */
  readonly fromDay: number;
  /** The day it ended: the next act's first day, or the day the campaign ended. */
  readonly toDay: number;
  /** Missions resolved before it began; its first mission is number `missionsBefore + 1`. */
  readonly missionsBefore: number;
  /** Missions resolved during it, the one that ended it included. */
  readonly missions: number;
  /**
   * The story mission whose win ended it. Absent for the act a defeat
   * ended, which no story mission closed.
   */
  readonly endedBy?: StoryMissionId;
}

// ===========================================
// Story missions
// ===========================================

/** A story mission won, with the act and day it was won in. */
export interface ChronicleStoryWin {
  readonly storyId: StoryMissionId;
  readonly act: ActId;
  readonly day: number;
}

// ===========================================
// Nemeses
// ===========================================

/**
 * What became of a nemesis (campaign arc §6.8): killed on a day, or
 * still out there when the campaign ended.
 */
export interface NemesisFate {
  readonly id: NemesisId;
  /** Its name, e.g. "Old Scald". */
  readonly name: string;
  /** What it was. */
  readonly speciesId: BugSpeciesId;
  /** The day it was killed; absent while it still lives. */
  readonly killedDay?: number;
}

// ===========================================
// The squad
// ===========================================

/** Which kind of roster entry a roll entry is. */
export type RollEntryKind = "mech" | "squad";

/**
 * A mech or infantry squad that finished the campaign, with its record
 * from the roster (GDD §5.7): kills, missions survived and experience.
 */
export interface SquadRollEntry {
  readonly kind: RollEntryKind;
  /** The roster id. */
  readonly id: string;
  /** Its player-facing name. */
  readonly name: string;
  /** Lifetime confirmed kills. */
  readonly kills: number;
  /** Missions it came back from. */
  readonly missionsSurvived: number;
  /** Lifetime experience, from which the screen may name its rank. */
  readonly xp: number;
}
