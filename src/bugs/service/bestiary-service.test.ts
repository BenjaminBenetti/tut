import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { BESTIARY } from "../data/bestiary";
import { ARMOURED_VARIANT_BASES } from "../data/species";
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
    // Act III and the finale add the armoured variants (#1179), after
    // the species that came before them, the burrower included.
    for (const act of ["act-3", "finale"] as const) {
      expect(Object.keys(bugMixFor(act, 0))).toEqual([
        "swarmer",
        "lurker",
        "brute",
        "spitter",
        "burrower",
        "swarmer-armoured",
        "lurker-armoured",
        "brute-armoured",
      ]);
    }
  });

  it("never rolls a burrower in act-1, and brings it into act-2 after five played, renormalised", () => {
    for (let played = 0; played <= 30; played++) {
      expect(bugMixFor("act-1", played).burrower).toBeUndefined();
    }
    expect(bugMixFor("act-2", 4).burrower).toBeUndefined();
    const debut = bugMixFor("act-2", 5);
    expect(debut).toEqual({
      swarmer: expect.closeTo(0.4, 12) as number,
      lurker: expect.closeTo(0.2, 12) as number,
      brute: expect.closeTo(0.1, 12) as number,
      spitter: expect.closeTo(0.15, 12) as number,
      burrower: expect.closeTo(0.15, 12) as number,
    });
    // Act III's column is whole (100), so the arc's 12 is 12 %; the
    // finale's is 85 until the Sovereign's escort share lands.
    expect(bugMixFor("act-3", 0).burrower).toBeCloseTo(12 / 100, 12);
    expect(bugMixFor("finale", 0).burrower).toBeCloseTo(10 / 85, 12);
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

  it("mixes the armoured variants into Act III from its first mission, renormalised over the act's column (#1179)", () => {
    // act-3: 20 + 12 + 8 + 13 + 12 + (18 + 10 + 7) = 100; with the
    // burrower's row in, the column is whole and the arc's 35 is 35 %.
    const mix = bugMixFor("act-3", 0);
    expect(mix).toEqual({
      swarmer: expect.closeTo(20 / 100, 12) as number,
      lurker: expect.closeTo(12 / 100, 12) as number,
      brute: expect.closeTo(8 / 100, 12) as number,
      spitter: expect.closeTo(13 / 100, 12) as number,
      burrower: expect.closeTo(12 / 100, 12) as number,
      "swarmer-armoured": expect.closeTo(18 / 100, 12) as number,
      "lurker-armoured": expect.closeTo(10 / 100, 12) as number,
      "brute-armoured": expect.closeTo(7 / 100, 12) as number,
    });
    const armoured =
      mix["swarmer-armoured"]! +
      mix["lurker-armoured"]! +
      mix["brute-armoured"]!;
    expect(armoured).toBeCloseTo(35 / 100, 12);
    // The finale: 15 + 10 + 8 + 12 + 10 + (14 + 9 + 7) = 85.
    const finale = bugMixFor("finale", 0);
    expect(finale["swarmer-armoured"]).toBeCloseTo(14 / 85, 12);
    expect(finale["lurker-armoured"]).toBeCloseTo(9 / 85, 12);
    expect(finale["brute-armoured"]).toBeCloseTo(7 / 85, 12);
    expect(finale.swarmer).toBeCloseTo(15 / 85, 12);
  });

  it("leaves every Act I and II mix exactly as it was before the variants' rows (#1179)", () => {
    // The same table with the variant rows taken out: what every Act I
    // and II offer rolled before they landed. Same weights, same key
    // order, byte for byte, at every mission count.
    const variants = new Set<string>(Object.keys(ARMOURED_VARIANT_BASES));
    const before: Bestiary = Object.fromEntries(
      Object.entries(BESTIARY).filter(([id]) => !variants.has(id)),
    );
    for (const act of ["act-1", "act-2"] as const) {
      for (let played = 0; played <= 30; played++) {
        const mix = bugMixFor(act, played);
        expect(Object.keys(mix).filter((id) => variants.has(id))).toEqual([]);
        expect(JSON.stringify(mix)).toBe(
          JSON.stringify(bugMixFor(act, played, before)),
        );
      }
    }
    // And the variants really are in the table the check stripped.
    expect(JSON.stringify(bugMixFor("act-3", 0))).not.toBe(
      JSON.stringify(bugMixFor("act-3", 0, before)),
    );
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
