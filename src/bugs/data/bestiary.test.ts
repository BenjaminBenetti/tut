import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import type { ActId } from "../../content/model/act-id";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import type { ArmouredBaseId } from "../model/armoured-variant";
import { BESTIARY } from "./bestiary";
import { ARMOURED_VARIANT_BASES } from "./species";

describe("BESTIARY", () => {
  it("carries the campaign arc §8 shares and debuts for the shipped species, and places the Hive Guard", () => {
    expect(BESTIARY).toEqual({
      swarmer: {
        kind: "rolled",
        shares: { "act-1": 60, "act-2": 40, "act-3": 20, finale: 15 },
        debut: { act: "act-1", missionsInAct: 0 },
      },
      lurker: {
        kind: "rolled",
        shares: { "act-1": 25, "act-2": 20, "act-3": 12, finale: 10 },
        debut: { act: "act-1", missionsInAct: 0 },
      },
      brute: {
        kind: "rolled",
        shares: { "act-1": 5, "act-2": 10, "act-3": 8, finale: 8 },
        debut: { act: "act-1", missionsInAct: 4 },
      },
      spitter: {
        kind: "rolled",
        shares: { "act-1": 10, "act-2": 15, "act-3": 13, finale: 12 },
        debut: { act: "act-1", missionsInAct: 7 },
      },
      burrower: {
        kind: "rolled",
        shares: { "act-1": 0, "act-2": 15, "act-3": 12, finale: 10 },
        debut: { act: "act-2", missionsInAct: 5 },
      },
      "hive-guard": { kind: "placed" },
      "swarmer-armoured": {
        kind: "rolled",
        shares: { "act-1": 0, "act-2": 0, "act-3": 18, finale: 14 },
        debut: { act: "act-3", missionsInAct: 0 },
      },
      "lurker-armoured": {
        kind: "rolled",
        shares: { "act-1": 0, "act-2": 0, "act-3": 10, finale: 9 },
        debut: { act: "act-3", missionsInAct: 0 },
      },
      "brute-armoured": {
        kind: "rolled",
        shares: { "act-1": 0, "act-2": 0, "act-3": 7, finale: 7 },
        debut: { act: "act-3", missionsInAct: 0 },
      },
    });
  });

  it("has an entry for every shipped species, rolled or placed", () => {
    // A species with no entry is never rolled on an offer that carries a
    // mix, whatever its hatch weight: a new species adds its row (or a
    // `placed` one for a boss) when it lands.
    const missing = BUG_SPECIES_IDS.filter((id) => BESTIARY[id] === undefined);
    expect(missing).toEqual([]);
  });

  it("sums each act's rolled column as the arc §8 table does: 100 a column, the finale 85 until the Sovereign lands", () => {
    // The burrower's row (#1179) and the armoured variants' (#1179) land
    // in the same act-3 and finale columns: together they fill act-3 to
    // the arc's 100 (20 + 12 + 8 + 13 + 12 + 35). The finale's missing
    // 15 is the Sovereign's escort share (arc §8, footnote).
    const totals = Object.fromEntries(
      ACT_IDS.map((act) => [
        act,
        BUG_SPECIES_IDS.reduce((sum, id) => {
          const entry = BESTIARY[id];
          return sum + (entry?.kind === "rolled" ? entry.shares[act] : 0);
        }, 0),
      ]),
    );
    expect(totals).toEqual({
      "act-1": 100,
      "act-2": 100,
      "act-3": 100,
      finale: 85,
    });
  });

  it("gives every rolled species non-negative shares and a whole debut in an act where it has a share", () => {
    for (const id of BUG_SPECIES_IDS) {
      const entry = BESTIARY[id];
      if (entry?.kind !== "rolled") {
        continue;
      }
      for (const act of ACT_IDS) {
        expect(entry.shares[act]).toBeGreaterThanOrEqual(0);
      }
      expect(Number.isInteger(entry.debut.missionsInAct)).toBe(true);
      expect(entry.debut.missionsInAct).toBeGreaterThanOrEqual(0);
      expect(entry.shares[entry.debut.act]).toBeGreaterThan(0);
    }
  });
});

describe("BESTIARY's armoured variants (#1179)", () => {
  const variants = Object.entries(ARMOURED_VARIANT_BASES) as [
    keyof typeof ARMOURED_VARIANT_BASES,
    ArmouredBaseId,
  ][];

  /** A rolled entry's share in an act (a placed entry has none). */
  function share(id: BugSpeciesId, act: ActId): number {
    const entry = BESTIARY[id];
    return entry?.kind === "rolled" ? entry.shares[act] : 0;
  }

  it("take nothing before Act III and debut at its first mission", () => {
    for (const [variant] of variants) {
      expect([
        variant,
        share(variant, "act-1"),
        share(variant, "act-2"),
      ]).toEqual([variant, 0, 0]);
      const entry = BESTIARY[variant];
      expect(entry?.kind === "rolled" && entry.debut).toEqual({
        act: "act-3",
        missionsInAct: 0,
      });
    }
  });

  it.each([
    ["act-3", 35],
    ["finale", 30],
  ] as const)(
    "split the arc's %s total of %i in proportion to their bases, each within a point",
    (act, total) => {
      const shares = variants.map(([variant]) => share(variant, act));
      expect(shares.reduce((sum, value) => sum + value, 0)).toBe(total);
      const bases = variants.map(([, base]) => share(base, act));
      const baseTotal = bases.reduce((sum, value) => sum + value, 0);
      for (const [index, [variant]] of variants.entries()) {
        const exact = (total * bases[index]!) / baseTotal;
        expect([variant, Math.abs(shares[index]! - exact) < 1]).toEqual([
          variant,
          true,
        ]);
        expect(Number.isInteger(shares[index])).toBe(true);
      }
    },
  );
});
