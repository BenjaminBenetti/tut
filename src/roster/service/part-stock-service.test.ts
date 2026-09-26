import { describe, expect, it } from "vitest";

import { MECH_RATING_TUNING } from "../data/mech-rating-tuning";
import { STARTER_PARTS } from "../data/parts";
import { STARTER_LOADOUT } from "../data/starter-roster";
import { UPGRADE_TUNING } from "../data/upgrade-tuning";
import type { MechLoadout } from "../model/mech-loadout";
import type { MechStatSheet } from "../model/mech-stat-sheet";
import { ALL_PARTS_AVAILABLE } from "../model/part-availability";
import { PARTS_STOCKED } from "../model/roster-event";
import type { RosterState } from "../model/roster-state";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import { validateLoadout } from "./loadout-validation-service";
import {
  mechBuildQuote,
  salvageableParts,
  stockCount,
  stockedParts,
  stockOf,
  stockParts,
  withdrawParts,
} from "./part-stock-service";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);
const EMPTY: RosterState = {
  squads: [],
  mechs: [],
  savedLoadouts: [],
  graveyard: [],
};
/** The starter loadout with a second radiator, so a part repeats. */
const TWIN_RADIATORS: MechLoadout = {
  ...STARTER_LOADOUT,
  utilityIds: ["utility-radiator", "utility-radiator"],
};

/** The loadout's validated sheet, failing the test when it does not validate. */
function sheetOf(loadout: MechLoadout): MechStatSheet {
  const sheet = validateLoadout(
    loadout,
    PARTS,
    MECH_RATING_TUNING,
    UPGRADE_TUNING,
    ALL_PARTS_AVAILABLE,
  );
  if (!sheet.ok) {
    throw new Error("fixture loadout does not validate");
  }
  return sheet.value;
}

// ===========================================
// stockParts
// ===========================================

describe("stockParts", () => {
  it("counts each recovered part into the stock and announces them", () => {
    const stocked = stockParts(
      EMPTY,
      ["legs-strider", "utility-radiator", "utility-radiator"],
      "mission-7",
    );
    expect(stocked.roster.partStock).toEqual({
      "legs-strider": 1,
      "utility-radiator": 2,
    });
    expect(stocked.events).toEqual([
      {
        type: PARTS_STOCKED,
        payload: {
          parts: ["legs-strider", "utility-radiator", "utility-radiator"],
          missionId: "mission-7",
        },
      },
    ]);
  });

  it("adds to what is already in stock without touching the input", () => {
    const roster: RosterState = { ...EMPTY, partStock: { "legs-strider": 1 } };
    const stocked = stockParts(roster, ["legs-strider"], "mission-7");
    expect(stocked.roster.partStock).toEqual({ "legs-strider": 2 });
    expect(roster.partStock).toEqual({ "legs-strider": 1 });
  });

  it("hands the roster back untouched, with no event, when nothing came home", () => {
    const stocked = stockParts(EMPTY, [], "mission-7");
    expect(stocked.roster).toBe(EMPTY);
    expect(stocked.events).toEqual([]);
  });
});

// ===========================================
// Queries
// ===========================================

describe("stock queries", () => {
  it("reads an absent stock as empty", () => {
    expect(stockOf(EMPTY)).toEqual({});
    expect(stockCount(stockOf(EMPTY), "legs-strider")).toBe(0);
  });

  it("lists stocked parts with their counts, leaving zero counts out", () => {
    expect(stockedParts({ "legs-strider": 2, "utility-radiator": 0 })).toEqual([
      { id: "legs-strider", count: 2 },
    ]);
  });
});

describe("salvageableParts", () => {
  it("covers each fitted part once per count in stock, in loadout order", () => {
    expect(
      salvageableParts(TWIN_RADIATORS, {
        "utility-radiator": 1,
        "legs-strider": 3,
        "arm-weapon-laser": 1,
      }),
    ).toEqual(["legs-strider", "utility-radiator"]);
    expect(salvageableParts(TWIN_RADIATORS, { "utility-radiator": 2 })).toEqual(
      ["utility-radiator", "utility-radiator"],
    );
  });

  it("covers nothing from an empty stock", () => {
    expect(salvageableParts(STARTER_LOADOUT, {})).toEqual([]);
  });
});

describe("mechBuildQuote", () => {
  it("takes each salvaged part's base cost off the sheet's total", () => {
    const sheet = sheetOf(STARTER_LOADOUT);
    const quote = mechBuildQuote(
      STARTER_LOADOUT,
      sheet,
      { "legs-strider": 1 },
      PARTS,
    );
    expect(quote).toEqual({
      cost: sheet.totalCost - 350,
      fullCost: sheet.totalCost,
      salvaged: ["legs-strider"],
    });
  });

  it("quotes the full price with nothing in stock", () => {
    const sheet = sheetOf(STARTER_LOADOUT);
    expect(mechBuildQuote(STARTER_LOADOUT, sheet, {}, PARTS)).toEqual({
      cost: sheet.totalCost,
      fullCost: sheet.totalCost,
      salvaged: [],
    });
  });
});

describe("withdrawParts", () => {
  it("takes one count per listed part and drops counts that reach zero", () => {
    expect(
      withdrawParts({ "legs-strider": 2, "utility-radiator": 1 }, [
        "legs-strider",
        "utility-radiator",
      ]),
    ).toEqual({ "legs-strider": 1 });
  });

  it("ignores a part that is not in stock", () => {
    expect(withdrawParts({ "legs-strider": 1 }, ["utility-radiator"])).toEqual({
      "legs-strider": 1,
    });
  });
});
