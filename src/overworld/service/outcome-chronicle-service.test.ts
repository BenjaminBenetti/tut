import { describe, expect, it } from "vitest";

import { createInitialCampaignProgress } from "./campaign-progress-factory";
import {
  chronicledCampaign,
  FOUR_ACTS,
  firstAttemptVictory,
  GREY_WIDOW,
  lastHopeVictory,
  OLD_SCALD,
  storyDefeat,
  threatDefeatInActTwo,
  WINS_TO_THE_FINALE,
} from "./outcome-chronicle-fixtures.test-helper";
import {
  chronicleSummary,
  platformAttempts,
} from "./outcome-chronicle-service";

// ===========================================
// Acts
// ===========================================

describe("chronicleSummary: the acts", () => {
  it("spans every act of a won campaign in days and missions, each ended by its gate", () => {
    expect(chronicleSummary(firstAttemptVictory(), "victory").acts).toEqual([
      {
        act: "act-1",
        fromDay: 1,
        toDay: 14,
        missionsBefore: 0,
        missions: 12,
        endedBy: "live-specimen",
      },
      {
        act: "act-2",
        fromDay: 14,
        toDay: 38,
        missionsBefore: 12,
        missions: 20,
        endedBy: "intact-pod",
      },
      {
        act: "act-3",
        fromDay: 38,
        toDay: 60,
        missionsBefore: 32,
        missions: 15,
        endedBy: "launch-window",
      },
      {
        act: "finale",
        fromDay: 60,
        toDay: 67,
        missionsBefore: 47,
        missions: 3,
        endedBy: "spore-platform",
      },
    ]);
  });

  it("leaves the act a defeat ended without an ending", () => {
    const acts = chronicleSummary(threatDefeatInActTwo(), "defeat").acts;
    expect(acts).toEqual([
      {
        act: "act-1",
        fromDay: 1,
        toDay: 14,
        missionsBefore: 0,
        missions: 12,
        endedBy: "live-specimen",
      },
      {
        act: "act-2",
        fromDay: 14,
        toDay: 29,
        missionsBefore: 12,
        missions: 12,
      },
    ]);
    const lost = chronicleSummary(storyDefeat(), "defeat").acts;
    expect(lost?.at(-1)).toEqual({
      act: "finale",
      fromDay: 60,
      toDay: 75,
      missionsBefore: 47,
      missions: 6,
    });
  });

  it("names Act I's start as the campaign's own: day 1, before the first mission", () => {
    const early = chronicledCampaign({
      act: "act-1",
      day: 9,
      missionsPlayed: 7,
    });
    expect(chronicleSummary(early, "defeat").acts).toEqual([
      { act: "act-1", fromDay: 1, toDay: 9, missionsBefore: 0, missions: 7 },
    ]);
  });

  it("leaves the acts out when an act's start was never recorded", () => {
    // A save from before the chronicle, already in Act III.
    const old = chronicledCampaign({ act: "act-3", day: 50 });
    expect(chronicleSummary(old, "defeat")).not.toHaveProperty("acts");
    // A gap: Act III recorded, Act II not.
    const gap = chronicledCampaign({
      act: "act-3",
      chronicle: {
        acts: FOUR_ACTS.filter((entry) => entry.act === "act-3"),
        storyWins: [],
        nemesesKilled: [],
      },
    });
    expect(chronicleSummary(gap, "defeat")).not.toHaveProperty("acts");
  });
});

// ===========================================
// Story wins, nemeses and the squad
// ===========================================

describe("chronicleSummary: the record", () => {
  it("copies the story wins in order, repeats kept", () => {
    expect(
      chronicleSummary(firstAttemptVictory(), "victory").storyWins,
    ).toEqual([
      ...WINS_TO_THE_FINALE,
      { storyId: "spore-platform", act: "finale", day: 66 },
    ]);
    const unchronicled = chronicledCampaign({ act: "act-1" });
    expect(chronicleSummary(unchronicled, "defeat")).not.toHaveProperty(
      "storyWins",
    );
  });

  it("lists the nemeses killed, with the day, then those still out there", () => {
    expect(chronicleSummary(firstAttemptVictory(), "victory").nemeses).toEqual([
      {
        id: "nemesis-1",
        name: "Old Scald",
        speciesId: "broodmother",
        killedDay: 52,
      },
      { id: "nemesis-2", name: "Grey Widow", speciesId: "broodmother" },
    ]);
    // A nemesis both recorded killed and still listed is killed.
    const both = chronicledCampaign({
      nemeses: [OLD_SCALD, GREY_WIDOW],
      chronicle: {
        acts: [],
        storyWins: [],
        nemesesKilled: [
          {
            id: "nemesis-1",
            name: "Old Scald",
            speciesId: "broodmother",
            day: 9,
          },
        ],
      },
    });
    expect(
      chronicleSummary(both, "defeat").nemeses?.map((n) => n.name),
    ).toEqual(["Old Scald", "Grey Widow"]);
  });

  it("rolls the mechs, then the squads, with their kills, missions and experience", () => {
    expect(chronicleSummary(firstAttemptVictory(), "victory").squad).toEqual([
      {
        kind: "mech",
        id: "mech-1",
        name: "Hammerhead",
        kills: 64,
        missionsSurvived: 44,
        xp: 640,
      },
      {
        kind: "mech",
        id: "mech-4",
        name: "Lantern",
        kills: 19,
        missionsSurvived: 15,
        xp: 190,
      },
      {
        kind: "squad",
        id: "squad-1",
        name: "Alpha",
        kills: 23,
        missionsSurvived: 31,
        xp: 230,
      },
    ]);
  });

  it("counts missions from campaign progress", () => {
    expect(chronicleSummary(lastHopeVictory(), "victory")).toMatchObject({
      missionsPlayed: 53,
      missionsWon: 43,
    });
  });
});

// ===========================================
// The platform
// ===========================================

describe("platformAttempts", () => {
  it("is 1 for a first-attempt win and 2 when Last Hope was needed", () => {
    expect(chronicleSummary(firstAttemptVictory(), "victory")).toMatchObject({
      platformAttempts: 1,
    });
    expect(chronicleSummary(lastHopeVictory(), "victory")).toMatchObject({
      platformAttempts: 2,
    });
  });

  it("is 2 for the story defeat, 1 after a single failure, and absent before the platform", () => {
    expect(chronicleSummary(storyDefeat(), "defeat").platformAttempts).toBe(2);
    const once = {
      ...createInitialCampaignProgress(),
      flags: ["platform-failed" as const],
    };
    expect(platformAttempts(once)).toBe(1);
    expect(
      chronicleSummary(threatDefeatInActTwo(), "defeat"),
    ).not.toHaveProperty("platformAttempts");
    // A spine that ends before the finale wins without the platform.
    const early = chronicledCampaign({
      act: "act-1",
      flags: ["campaign-won"],
      storyWon: ["live-specimen"],
    });
    expect(chronicleSummary(early, "victory")).not.toHaveProperty(
      "platformAttempts",
    );
  });
});
