import { describe, expect, it } from "vitest";

import type { CampaignProgress } from "../model/campaign-progress";
import type { Nemesis } from "../model/nemesis";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import {
  chronicleActStart,
  chronicleNemesisKill,
  chronicleOf,
  chronicleStoryWin,
  EMPTY_CHRONICLE,
} from "./campaign-chronicle-service";

// ===========================================
// Fixtures
// ===========================================

/** Progress in `act` after `played` missions, with no chronicle. */
function progressAt(
  act: CampaignProgress["act"],
  played: number,
): CampaignProgress {
  return {
    ...createInitialCampaignProgress(),
    act,
    actStartedAt: played,
    missionsPlayed: played,
  };
}

const OLD_SCALD: Nemesis = {
  id: "nemesis-1",
  speciesId: "broodmother",
  name: "Old Scald",
  scar: "burned by the Hellfire battery",
  regionId: "east",
  level: 2,
  escapes: 1,
};

// ===========================================
// Tests
// ===========================================

describe("chronicleOf", () => {
  it("reads an unwritten chronicle as empty", () => {
    expect(chronicleOf(createInitialCampaignProgress())).toBe(EMPTY_CHRONICLE);
    expect(EMPTY_CHRONICLE).toEqual({
      acts: [],
      storyWins: [],
      nemesesKilled: [],
    });
  });
});

describe("chronicleActStart", () => {
  it("records the act progress is in, with the day and the missions before it", () => {
    const before = progressAt("act-2", 12);
    const after = chronicleActStart(before, 14);
    expect(after.chronicle).toEqual({
      acts: [{ act: "act-2", day: 14, missionsPlayed: 12 }],
      storyWins: [],
      nemesesKilled: [],
    });
    expect(before.chronicle).toBeUndefined();
    const third = chronicleActStart({ ...after, act: "act-3" }, 30);
    expect(third.chronicle?.acts).toEqual([
      { act: "act-2", day: 14, missionsPlayed: 12 },
      { act: "act-3", day: 30, missionsPlayed: 12 },
    ]);
  });

  it("never moves an act's start once it is written", () => {
    const once = chronicleActStart(progressAt("act-2", 12), 14);
    const again = chronicleActStart({ ...once, missionsPlayed: 20 }, 22);
    expect(again.chronicle?.acts).toEqual([
      { act: "act-2", day: 14, missionsPlayed: 12 },
    ]);
  });
});

describe("chronicleStoryWin", () => {
  it("records each win in the act it was won in, repeats kept", () => {
    let progress = chronicleStoryWin(progressAt("act-3", 33), "uplink", 45);
    for (const day of [50, 55, 58]) {
      progress = chronicleStoryWin(progress, "great-hive", day);
    }
    expect(progress.chronicle?.storyWins).toEqual([
      { storyId: "uplink", act: "act-3", day: 45 },
      { storyId: "great-hive", act: "act-3", day: 50 },
      { storyId: "great-hive", act: "act-3", day: 55 },
      { storyId: "great-hive", act: "act-3", day: 58 },
    ]);
    expect(progress.chronicle?.acts).toEqual([]);
  });
});

describe("chronicleNemesisKill", () => {
  it("keeps a killed nemesis's name and day, once", () => {
    const killed = chronicleNemesisKill(
      { ...progressAt("act-3", 40), nemeses: [OLD_SCALD] },
      OLD_SCALD,
      212,
    );
    expect(killed.chronicle?.nemesesKilled).toEqual([
      {
        id: "nemesis-1",
        name: "Old Scald",
        speciesId: "broodmother",
        day: 212,
      },
    ]);
    // Recording is all it does: removing her is the kill rule's job.
    expect(killed.nemeses).toEqual([OLD_SCALD]);
    expect(chronicleNemesisKill(killed, OLD_SCALD, 213)).toBe(killed);
  });
});
