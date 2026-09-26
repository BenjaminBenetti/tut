import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import type { Bestiary } from "../model/bestiary";
import type { SpeciesMix } from "../model/species-mix";
import { bugMixFor, hasDebuted } from "./bestiary-service";

// ===========================================
// Fixtures
// ===========================================

/** The sum of a mix's weights. */
function total(mix: SpeciesMix): number {
  return Object.values(mix).reduce((sum, weight) => sum + weight, 0);
}

/**
 * A table whose rows exercise what the shipped one cannot yet: a species
 * that debuts mid-way through a later act (the burrower's "act-2 + 5"),
 * one with no share in the act it debuts in, and a placed boss.
 */
const LATER: Bestiary = {
  swarmer: {
    kind: "rolled",
    shares: { "act-1": 3, "act-2": 3, "act-3": 3, finale: 3 },
    debut: { act: "act-1", missionsInAct: 0 },
  },
  lurker: {
    kind: "rolled",
    shares: { "act-1": 0, "act-2": 1, "act-3": 1, finale: 1 },
    debut: { act: "act-2", missionsInAct: 5 },
  },
  brute: {
    kind: "rolled",
    shares: { "act-1": 0, "act-2": 0, "act-3": 2, finale: 2 },
    debut: { act: "act-1", missionsInAct: 0 },
  },
  spitter: { kind: "placed" },
};

// ===========================================
// The shipped bestiary
// ===========================================

describe("bugMixFor on the shipped bestiary", () => {
  it("opens act-1 with only swarmers and lurkers, renormalised 60:25", () => {
    const mix = bugMixFor("act-1", 0);
    expect(Object.keys(mix)).toEqual(["swarmer", "lurker"]);
    expect(mix.swarmer).toBeCloseTo(60 / 85, 12);
    expect(mix.lurker).toBeCloseTo(25 / 85, 12);
  });

  it("brings the brute in at M5 (four played) and the spitter at M8 (seven played)", () => {
    expect(Object.keys(bugMixFor("act-1", 3))).toEqual(["swarmer", "lurker"]);
    const m5 = bugMixFor("act-1", 4);
    expect(Object.keys(m5)).toEqual(["swarmer", "lurker", "brute"]);
    expect(m5.brute).toBeCloseTo(5 / 90, 12);
    expect(Object.keys(bugMixFor("act-1", 6))).toEqual([
      "swarmer",
      "lurker",
      "brute",
    ]);
    const m8 = bugMixFor("act-1", 7);
    expect(m8).toEqual({
      swarmer: expect.closeTo(0.6, 12) as number,
      lurker: expect.closeTo(0.25, 12) as number,
      brute: expect.closeTo(0.05, 12) as number,
      spitter: expect.closeTo(0.1, 12) as number,
    });
    // Once in, a species stays in for the rest of the act.
    expect(Object.keys(bugMixFor("act-1", 30))).toEqual(Object.keys(m8));
  });

  it("keeps the brute and the spitter in act-2 from its first mission, since they debuted earlier", () => {
    const mix = bugMixFor("act-2", 0);
    expect(Object.keys(mix)).toEqual(["swarmer", "lurker", "brute", "spitter"]);
    expect(mix.swarmer).toBeCloseTo(40 / 85, 12);
    expect(mix.lurker).toBeCloseTo(20 / 85, 12);
    expect(mix.brute).toBeCloseTo(10 / 85, 12);
    expect(mix.spitter).toBeCloseTo(15 / 85, 12);
    for (const act of ["act-3", "finale"] as const) {
      expect(Object.keys(bugMixFor(act, 0))).toEqual([
        "swarmer",
        "lurker",
        "brute",
        "spitter",
      ]);
    }
  });

  it("sums to 1 in every act at every mission count, with no share below or at 0", () => {
    for (const act of ACT_IDS) {
      for (let played = 0; played <= 20; played++) {
        const mix = bugMixFor(act, played);
        expect(total(mix)).toBeCloseTo(1, 12);
        for (const weight of Object.values(mix)) {
          expect(weight).toBeGreaterThan(0);
        }
      }
    }
  });

  it("is pure: the same inputs give the same mix, in the same key order", () => {
    const once = bugMixFor("act-1", 9);
    const again = bugMixFor("act-1", 9);
    expect(again).toEqual(once);
    expect(Object.keys(again)).toEqual(Object.keys(once));
    expect(JSON.stringify(again)).toBe(JSON.stringify(once));
  });
});

// ===========================================
// Debuts in later acts, zero shares and placed species
// ===========================================

describe("bugMixFor on a table with later debuts", () => {
  it("holds a species out before its act, and in its act until its mission count", () => {
    for (let played = 0; played <= 12; played++) {
      expect(bugMixFor("act-1", played, LATER).lurker).toBeUndefined();
    }
    expect(bugMixFor("act-2", 4, LATER).lurker).toBeUndefined();
    expect(bugMixFor("act-2", 5, LATER).lurker).toBeCloseTo(1 / 4, 12);
    // An act later than its debut's, at the act's first mission: in.
    expect(bugMixFor("act-3", 0, LATER).lurker).toBeCloseTo(1 / 6, 12);
  });

  it("leaves out a debuted species whose share in this act is 0, and never lists a placed one", () => {
    expect(bugMixFor("act-2", 9, LATER)).toEqual({
      swarmer: 0.75,
      lurker: 0.25,
    });
    expect(bugMixFor("act-3", 9, LATER)).toEqual({
      swarmer: 0.5,
      lurker: expect.closeTo(1 / 6, 12) as number,
      brute: expect.closeTo(1 / 3, 12) as number,
    });
    for (const act of ACT_IDS) {
      expect(bugMixFor(act, 50, LATER).spitter).toBeUndefined();
    }
  });

  it("is empty when nothing qualifies", () => {
    expect(bugMixFor("act-1", 0, {})).toEqual({});
    expect(bugMixFor("act-1", 0, { spitter: { kind: "placed" } })).toEqual({});
  });
});

describe("hasDebuted", () => {
  it("counts an earlier act as debuted, a later one as not, and its own act from the count", () => {
    const debut = { act: "act-2", missionsInAct: 5 } as const;
    expect(hasDebuted(debut, "act-1", 99)).toBe(false);
    expect(hasDebuted(debut, "act-2", 4)).toBe(false);
    expect(hasDebuted(debut, "act-2", 5)).toBe(true);
    expect(hasDebuted(debut, "act-2", 6)).toBe(true);
    expect(hasDebuted(debut, "act-3", 0)).toBe(true);
    expect(hasDebuted(debut, "finale", 0)).toBe(true);
  });
});
