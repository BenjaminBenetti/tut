import { describe, expect, it } from "vitest";

import type { Nemesis } from "../../overworld/model/nemesis";
import type { GameState } from "../../save/model/game-state";
import { campaignOnDay } from "../view/mission-fixtures.test-helper";
import { nemesisRows } from "./nemesis-rows";

// ===========================================
// Fixtures
// ===========================================

const OLD_SCALD: Nemesis = {
  id: "nemesis-old-scald",
  speciesId: "broodmother",
  name: "Old Scald",
  scar: "burned along the flank",
  regionId: "east-asia",
  level: 2,
  escapes: 2,
};

const GRINDER: Nemesis = {
  id: "nemesis-grinder",
  speciesId: "brute",
  name: "Grinder",
  scar: "a leg lost to the squad's guns",
  regionId: "western-europe",
  level: 1,
  escapes: 1,
};

/** A campaign whose record holds `nemeses`. */
function withNemeses(nemeses: readonly Nemesis[]): GameState {
  const state = campaignOnDay(12, []);
  return {
    ...state,
    overworld: {
      ...state.overworld,
      progress: { ...state.overworld.progress, nemeses },
    },
  };
}

// ===========================================
// Tests
// ===========================================

describe("nemesisRows (campaign arc §8, #1179)", () => {
  it("reads each nemesis by name, level, species, region and scar, in record order", () => {
    expect(nemesisRows(withNemeses([OLD_SCALD, GRINDER]))).toEqual([
      {
        id: "nemesis-old-scald",
        name: "Old Scald",
        level: "Level 2",
        where: "Broodmother · East Asia",
        scar: "burned along the flank",
      },
      {
        id: "nemesis-grinder",
        name: "Grinder",
        level: "Level 1",
        where: "Brute · Western Europe",
        scar: "a leg lost to the squad's guns",
      },
    ]);
  });

  it("keeps the ids of a species or region this build does not know", () => {
    const stranger: Nemesis = {
      ...GRINDER,
      speciesId: "queen" as Nemesis["speciesId"],
      regionId: "atlantis",
    };
    expect(nemesisRows(withNemeses([stranger]))[0]?.where).toBe(
      "queen · atlantis",
    );
  });

  it("is empty with no campaign or an empty record", () => {
    expect(nemesisRows(undefined)).toEqual([]);
    expect(nemesisRows(withNemeses([]))).toEqual([]);
  });
});
