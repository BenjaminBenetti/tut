import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { RosterState } from "../../roster/model/roster-state";
import type {
  CampaignChronicle,
  StoryWinRecord,
} from "../model/campaign-chronicle";
import type { CampaignProgress } from "../model/campaign-progress";
import type { CampaignState } from "../model/campaign-state";
import type { Nemesis } from "../model/nemesis";
import type { OverworldState } from "../model/overworld-state";
import { MAX_THREAT } from "../model/threat";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import { fixtureState } from "./missions/mission-fixtures.test-helper";

// ===========================================
// The chronicle
// ===========================================

/**
 * Every story win of a full campaign up to Launch Window, which opens
 * the finale: the arc's average pace (§1), 12 / 20 / 15 missions.
 *
 * ```
 *   Act I   d1–14   M1–12    First Skyfall d2, Live Specimen d14
 *   Act II  d14–38  M13–32   Intact Pod d38
 *   Act III d38–60  M33–47   Uplink d42, Great Hive ×3 d48/52/56, Launch Window d60
 *   Finale  d60–    M48–
 * ```
 */
export const WINS_TO_THE_FINALE: readonly StoryWinRecord[] = [
  { storyId: "first-skyfall", act: "act-1", day: 2 },
  { storyId: "live-specimen", act: "act-1", day: 14 },
  { storyId: "intact-pod", act: "act-2", day: 38 },
  { storyId: "uplink", act: "act-3", day: 42 },
  { storyId: "great-hive", act: "act-3", day: 48 },
  { storyId: "great-hive", act: "act-3", day: 52 },
  { storyId: "great-hive", act: "act-3", day: 56 },
  { storyId: "launch-window", act: "act-3", day: 60 },
];

/** The acts after Act I of that campaign, each begun on its gate's day. */
export const FOUR_ACTS: CampaignChronicle["acts"] = [
  { act: "act-2", day: 14, missionsPlayed: 12 },
  { act: "act-3", day: 38, missionsPlayed: 32 },
  { act: "finale", day: 60, missionsPlayed: 47 },
];

/** Old Scald, a Broodmother who escaped once. */
export const OLD_SCALD: Nemesis = {
  id: "nemesis-1",
  speciesId: "broodmother",
  name: "Old Scald",
  scar: "burned by the Hellfire battery",
  regionId: "east",
  level: 2,
  escapes: 1,
};

/** Grey Widow, a Broodmother still out there. */
export const GREY_WIDOW: Nemesis = {
  id: "nemesis-2",
  speciesId: "broodmother",
  name: "Grey Widow",
  scar: "lost a leg to the squad",
  regionId: "west",
  level: 1,
  escapes: 1,
};

/** A loadout for the roll's mechs; the end screen never reads it. */
const LOADOUT: MechLoadout = {
  name: "Line",
  chassisId: "chassis-a",
  legsId: "legs-a",
  armsId: "arms-a",
  armWeaponId: "autocannon",
  backWeaponId: "missile-pod",
  utilityIds: [],
};

/** Two mechs and a squad that finished the campaign. */
export const VETERANS: RosterState = {
  squads: [
    {
      id: "squad-1",
      name: "Alpha",
      typeId: "rifle",
      strength: 5,
      maxStrength: 5,
      kills: 23,
      missionsSurvived: 31,
      xp: 230,
    },
  ],
  mechs: [
    {
      id: "mech-1",
      name: "Hammerhead",
      loadout: LOADOUT,
      damage: 12,
      kills: 64,
      missionsSurvived: 44,
      xp: 640,
    },
    {
      id: "mech-4",
      name: "Lantern",
      loadout: LOADOUT,
      damage: 0,
      kills: 19,
      missionsSurvived: 15,
      xp: 190,
    },
  ],
  savedLoadouts: [],
  graveyard: [],
};

// ===========================================
// Campaigns
// ===========================================

/** How a fixture campaign stands on its last day. */
export interface ChronicledOptions {
  readonly act?: CampaignProgress["act"];
  readonly day?: number;
  readonly threat?: number;
  readonly missionsPlayed?: number;
  readonly missionsWon?: number;
  readonly flags?: readonly CampaignFlagId[];
  readonly storyWon?: readonly StoryMissionId[];
  readonly chronicle?: CampaignChronicle;
  readonly nemeses?: readonly Nemesis[];
  readonly roster?: RosterState;
  readonly overworld?: Partial<OverworldState>;
}

/** A campaign on its last day, with a chronicle, before the outcome step. */
export function chronicledCampaign(options: ChronicledOptions): CampaignState {
  const progress: CampaignProgress = {
    ...createInitialCampaignProgress(),
    act: options.act ?? "finale",
    actStartedAt: 0,
    missionsPlayed: options.missionsPlayed ?? 50,
    missionsWon: options.missionsWon ?? 41,
    flags: options.flags ?? [],
    nemeses: options.nemeses ?? [],
    ...(options.storyWon === undefined ? {} : { storyWon: options.storyWon }),
    ...(options.chronicle === undefined
      ? {}
      : { chronicle: options.chronicle }),
  };
  return {
    meta: {
      rng: new Mulberry32Rng(1).getState(),
      ids: new SequentialIdGenerator().getState(),
    },
    overworld: fixtureState({
      day: options.day ?? 67,
      threat: options.threat ?? 52,
      progress,
      ...options.overworld,
    }),
    roster: options.roster ?? VETERANS,
    economy: { credits: 0, ledger: [], techPoints: 0 },
    tech: { unlocked: [] },
  };
}

/** Story missions won on the way to the finale, as `storyWon` lists them (no repeats). */
const WON_TO_THE_FINALE: readonly StoryMissionId[] = [
  "first-skyfall",
  "live-specimen",
  "intact-pod",
  "uplink",
  "great-hive",
  "launch-window",
];

/** The spore platform destroyed on the first assault, day 66. */
export function firstAttemptVictory(): CampaignState {
  return chronicledCampaign({
    flags: ["uplink-won", "platform-approach", "campaign-won"],
    storyWon: [...WON_TO_THE_FINALE, "spore-platform"],
    chronicle: {
      acts: FOUR_ACTS,
      storyWins: [
        ...WINS_TO_THE_FINALE,
        { storyId: "spore-platform", act: "finale", day: 66 },
      ],
      nemesesKilled: [
        {
          id: "nemesis-1",
          name: "Old Scald",
          speciesId: "broodmother",
          day: 52,
        },
      ],
    },
    nemeses: [GREY_WIDOW],
  });
}

/** The first assault failed on day 64; Last Hope brought it back and it fell on day 74. */
export function lastHopeVictory(): CampaignState {
  return chronicledCampaign({
    day: 75,
    missionsPlayed: 53,
    missionsWon: 43,
    flags: [
      "uplink-won",
      "platform-approach",
      "platform-failed",
      "last-hope",
      "campaign-won",
    ],
    storyWon: [...WON_TO_THE_FINALE, "spore-platform"],
    chronicle: {
      acts: FOUR_ACTS,
      storyWins: [
        ...WINS_TO_THE_FINALE,
        { storyId: "spore-platform", act: "finale", day: 74 },
      ],
      nemesesKilled: [],
    },
    nemeses: [OLD_SCALD],
  });
}

/** The platform held twice: the second assault failed on day 74. */
export function storyDefeat(): CampaignState {
  return chronicledCampaign({
    day: 75,
    threat: 81,
    missionsPlayed: 53,
    missionsWon: 42,
    flags: [
      "uplink-won",
      "platform-approach",
      "platform-failed",
      "last-hope",
      "campaign-lost",
    ],
    storyWon: WON_TO_THE_FINALE,
    chronicle: {
      acts: FOUR_ACTS,
      storyWins: WINS_TO_THE_FINALE,
      nemesesKilled: [],
    },
    nemeses: [OLD_SCALD],
  });
}

/** Threat reached its limit on day 29, twelve missions into Act II. */
export function threatDefeatInActTwo(): CampaignState {
  return chronicledCampaign({
    act: "act-2",
    day: 29,
    threat: MAX_THREAT,
    missionsPlayed: 24,
    missionsWon: 15,
    storyWon: ["first-skyfall", "live-specimen"],
    chronicle: {
      acts: [{ act: "act-2", day: 14, missionsPlayed: 12 }],
      storyWins: WINS_TO_THE_FINALE.slice(0, 2),
      nemesesKilled: [],
    },
    nemeses: [OLD_SCALD],
  });
}
