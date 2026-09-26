import { describe, expect, it } from "vitest";

import type { CampaignProgress } from "../model/campaign-progress";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import {
  advanceAct,
  hasFlag,
  missionsInAct,
  recordMission,
  withFlag,
} from "./campaign-progress-service";

/** Act II, entered after 12 missions, 4 more played since; one flag, two kills. */
function midCampaign(): CampaignProgress {
  return {
    act: "act-2",
    actStartedAt: 12,
    missionsPlayed: 16,
    missionsWon: 11,
    flags: ["spore-sample"],
    speciesKilled: ["swarmer", "lurker"],
    nemeses: [],
  };
}

/** Runs `fn` and asserts it left `input` exactly as it was. */
function untouched<T>(input: CampaignProgress, fn: () => T): T {
  const before = JSON.stringify(input);
  const out = fn();
  expect(JSON.stringify(input)).toBe(before);
  return out;
}

describe("missionsInAct", () => {
  it("counts missions resolved since the act began", () => {
    expect(missionsInAct(midCampaign())).toBe(4);
    expect(missionsInAct(createInitialCampaignProgress())).toBe(0);
  });
});

describe("advanceAct", () => {
  it("moves to the new act and starts its count at the missions played so far", () => {
    const before = midCampaign();
    const next = untouched(before, () => advanceAct(before, "act-3"));
    expect(next).toEqual({ ...before, act: "act-3", actStartedAt: 16 });
    expect(missionsInAct(next)).toBe(0);
  });

  it("may skip an act", () => {
    const next = advanceAct(createInitialCampaignProgress(), "finale");
    expect(next.act).toBe("finale");
  });

  it("returns the same progress when already in that act, keeping its count", () => {
    const before = midCampaign();
    expect(advanceAct(before, "act-2")).toBe(before);
  });

  it("refuses to move backwards", () => {
    expect(() => advanceAct(midCampaign(), "act-1")).toThrow(RangeError);
  });
});

describe("withFlag / hasFlag", () => {
  it("appends a new flag without touching the input", () => {
    const before = midCampaign();
    const next = untouched(before, () => withFlag(before, "capture-net"));
    expect(next.flags).toEqual(["spore-sample", "capture-net"]);
    expect(hasFlag(next, "capture-net")).toBe(true);
    expect(hasFlag(before, "capture-net")).toBe(false);
  });

  it("returns the same progress for a flag already held", () => {
    const before = midCampaign();
    expect(withFlag(before, "spore-sample")).toBe(before);
    expect(hasFlag(before, "spore-sample")).toBe(true);
  });
});

describe("recordMission", () => {
  it("counts a win as played and won", () => {
    const before = midCampaign();
    const next = untouched(before, () => recordMission(before, "won", []));
    expect(next.missionsPlayed).toBe(17);
    expect(next.missionsWon).toBe(12);
    expect(next.speciesKilled).toBe(before.speciesKilled);
  });

  it.each(["lost", "extracted"] as const)(
    "counts a %s mission as played but not won",
    (outcome) => {
      const next = recordMission(midCampaign(), outcome, []);
      expect(next.missionsPlayed).toBe(17);
      expect(next.missionsWon).toBe(11);
    },
  );

  it("appends only first kills, once each, in the order given", () => {
    const before = midCampaign();
    const next = untouched(before, () =>
      recordMission(before, "lost", ["brute", "swarmer", "brute"]),
    );
    expect(next.speciesKilled).toEqual(["swarmer", "lurker", "brute"]);
  });

  it("leaves the act, its start and the flags alone", () => {
    const before = midCampaign();
    const next = recordMission(before, "won", ["brute"]);
    expect(next.act).toBe(before.act);
    expect(next.actStartedAt).toBe(before.actStartedAt);
    expect(next.flags).toBe(before.flags);
    expect(next.nemeses).toBe(before.nemeses);
    expect(missionsInAct(next)).toBe(5);
  });
});
