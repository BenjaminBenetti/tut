import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import { BESTIARY } from "./bestiary";

describe("BESTIARY", () => {
  it("carries the campaign arc §8 shares and debuts for the shipped species", () => {
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
    });
  });

  it("has an entry for every shipped species, rolled or placed", () => {
    // A species with no entry is never rolled on an offer that carries a
    // mix, whatever its hatch weight: a new species adds its row (or a
    // `placed` one for a boss) when it lands.
    const missing = BUG_SPECIES_IDS.filter((id) => BESTIARY[id] === undefined);
    expect(missing).toEqual([]);
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
