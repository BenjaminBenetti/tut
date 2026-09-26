import { describe, expect, it } from "vitest";

import {
  actSpanText,
  daySpanText,
  missionSpanText,
  nemesisFateText,
  onDayText,
  rollRecordText,
} from "./chronicle-text";

describe("chronicle spans", () => {
  it("words an act's days, collapsing a one-day act", () => {
    expect(daySpanText(1, 14)).toBe("Days 1–14");
    expect(daySpanText(60, 60)).toBe("Day 60");
  });

  it("numbers an act's missions across the campaign", () => {
    expect(missionSpanText(0, 12)).toBe("Missions 1–12");
    expect(missionSpanText(12, 20)).toBe("Missions 13–32");
    expect(missionSpanText(47, 1)).toBe("Mission 48");
    expect(missionSpanText(47, 0)).toBe("No missions");
  });

  it("joins them into an act's span", () => {
    expect(
      actSpanText({
        act: "act-2",
        fromDay: 14,
        toDay: 38,
        missionsBefore: 12,
        missions: 20,
        endedBy: "intact-pod",
      }),
    ).toBe("Days 14–38 · Missions 13–32");
  });
});

describe("chronicle record", () => {
  it("says whether a nemesis was killed, and when", () => {
    expect(
      nemesisFateText({
        id: "n1",
        name: "Old Scald",
        speciesId: "broodmother",
        killedDay: 212,
      }),
    ).toBe("Old Scald: killed on day 212");
    expect(
      nemesisFateText({
        id: "n2",
        name: "Grey Widow",
        speciesId: "broodmother",
      }),
    ).toBe("Grey Widow: still out there");
    expect(onDayText(14)).toBe("day 14");
  });

  it("counts kills and missions, singular for one", () => {
    const entry = {
      kind: "mech" as const,
      id: "mech-1",
      name: "Hammerhead",
      kills: 64,
      missionsSurvived: 44,
      xp: 640,
    };
    expect(rollRecordText(entry)).toBe("64 kills · 44 missions");
    expect(rollRecordText({ ...entry, kills: 1, missionsSurvived: 1 })).toBe(
      "1 kill · 1 mission",
    );
  });
});
