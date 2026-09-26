import { describe, expect, it } from "vitest";

import { NEMESIS_LORE } from "../data/nemesis-lore";
import type { CampaignProgress } from "../model/campaign-progress";
import type { Mission } from "../model/mission";
import type { MissionResult } from "../model/mission-result";
import type { Nemesis } from "../model/nemesis";
import { chronicleOf } from "./campaign-chronicle-service";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import {
  alphaNemeses,
  broodmotherNemeses,
  nemesisIdFor,
  nemesisScar,
  recordAlphaOutcome,
  recordNemesisEscape,
  recordNemesisKill,
  removeNemesis,
} from "./nemesis-service";

// ===========================================
// Fixtures
// ===========================================

const GRINDER: Nemesis = {
  id: "nemesis:mission-2:alpha",
  speciesId: "brute",
  name: "Grinder",
  scar: "a leg lost to the squad's guns",
  regionId: "west",
  level: 1,
  escapes: 1,
};

const OLD_SCALD: Nemesis = {
  ...GRINDER,
  id: "nemesis:mission-3:broodmother",
  speciesId: "broodmother",
  name: "Old Scald",
};

/** Fresh progress with `nemeses` on the record. */
function progressWith(nemeses: readonly Nemesis[]): CampaignProgress {
  return { ...createInitialCampaignProgress(), nemeses };
}

/** An offer carrying a named alpha. */
function alphaOffer(alpha: Mission["alpha"]): Pick<Mission, "id" | "alpha"> {
  return { id: "mission-9", alpha };
}

/** A result whose alpha ended as `alpha`. */
function ended(
  outcome: MissionResult["outcome"],
  alpha: MissionResult["alpha"],
): Pick<MissionResult, "outcome" | "alpha"> {
  return { outcome, alpha };
}

// ===========================================
// Queries
// ===========================================

describe("nemesis queries", () => {
  it("derives ids from the mission and splits the record by species", () => {
    expect(nemesisIdFor("mission-12", "broodmother")).toBe(
      "nemesis:mission-12:broodmother",
    );
    const progress = progressWith([GRINDER, OLD_SCALD]);
    expect(broodmotherNemeses(progress)).toEqual([OLD_SCALD]);
    expect(alphaNemeses(progress)).toEqual([GRINDER]);
  });

  it("picks a scar from the mark's lines by name and escapes, the same every time", () => {
    for (const mark of ["gunfire", "fire", "unmarked"] as const) {
      const scar = nemesisScar(NEMESIS_LORE, "Old Scald", mark, 1);
      expect(NEMESIS_LORE.scars[mark]).toContain(scar);
      expect(nemesisScar(NEMESIS_LORE, "Old Scald", mark, 1)).toBe(scar);
    }
    // The next escape from the same wound reads differently.
    expect(nemesisScar(NEMESIS_LORE, "Old Scald", "fire", 2)).not.toBe(
      nemesisScar(NEMESIS_LORE, "Old Scald", "fire", 1),
    );
  });
});

// ===========================================
// Record
// ===========================================

describe("recordNemesisEscape / removeNemesis / recordNemesisKill", () => {
  it("adds a first meeting at level 1 and raises a known one", () => {
    const first = recordNemesisEscape(
      progressWith([]),
      {
        newId: "nemesis:mission-4:alpha",
        speciesId: "lurker",
        name: "Hook",
        regionId: "east",
        mark: "blast",
      },
      NEMESIS_LORE,
    );
    expect(first.nemeses).toEqual([
      {
        id: "nemesis:mission-4:alpha",
        speciesId: "lurker",
        name: "Hook",
        scar: nemesisScar(NEMESIS_LORE, "Hook", "blast", 1),
        regionId: "east",
        level: 1,
        escapes: 1,
      },
    ]);
    const raised = recordNemesisEscape(
      progressWith([GRINDER, OLD_SCALD]),
      {
        nemesisId: GRINDER.id,
        newId: "ignored",
        speciesId: "brute",
        name: "Grinder",
        regionId: "east",
        mark: "mech",
      },
      NEMESIS_LORE,
    );
    expect(raised.nemeses).toEqual([
      {
        ...GRINDER,
        level: 2,
        escapes: 2,
        regionId: "east",
        scar: nemesisScar(NEMESIS_LORE, "Grinder", "mech", 2),
      },
      OLD_SCALD,
    ]);
  });

  it("strikes a killed nemesis, and leaves the record alone for an unknown id", () => {
    const progress = progressWith([GRINDER, OLD_SCALD]);
    expect(removeNemesis(progress, GRINDER.id).nemeses).toEqual([OLD_SCALD]);
    expect(removeNemesis(progress, "nobody")).toBe(progress);
  });

  it("chronicles a killed nemesis by name, species and day before striking her", () => {
    const progress = progressWith([GRINDER, OLD_SCALD]);
    const killed = recordNemesisKill(progress, OLD_SCALD.id, 31);
    expect(killed.nemeses).toEqual([GRINDER]);
    expect(chronicleOf(killed).nemesesKilled).toEqual([
      {
        id: OLD_SCALD.id,
        name: "Old Scald",
        speciesId: "broodmother",
        day: 31,
      },
    ]);
    expect(recordNemesisKill(progress, "nobody", 31)).toBe(progress);
  });
});

// ===========================================
// Alpha Present
// ===========================================

describe("recordAlphaOutcome", () => {
  it("records a named alpha that lived through a mission not won, as a level-1 nemesis of its species", () => {
    const next = recordAlphaOutcome(
      progressWith([]),
      alphaOffer({ name: "Rattle", level: 0 }),
      ended("extracted", {
        speciesId: "spitter",
        survived: true,
        wound: "gunfire",
      }),
      "east",
      12,
      NEMESIS_LORE,
    );
    expect(next.nemeses).toEqual([
      {
        id: "nemesis:mission-9:alpha",
        speciesId: "spitter",
        name: "Rattle",
        scar: nemesisScar(NEMESIS_LORE, "Rattle", "gunfire", 1),
        regionId: "east",
        level: 1,
        escapes: 1,
      },
    ]);
  });

  it("raises a returning alpha that lives again, and strikes one that dies", () => {
    const progress = progressWith([GRINDER]);
    const returning = alphaOffer({
      name: "Grinder",
      level: 1,
      nemesisId: GRINDER.id,
      speciesId: "brute",
      scar: GRINDER.scar,
    });
    const lived = recordAlphaOutcome(
      progress,
      returning,
      ended("lost", { speciesId: "brute", survived: true }),
      "west",
      12,
      NEMESIS_LORE,
    );
    expect(lived.nemeses[0]).toMatchObject({ level: 2, escapes: 2 });
    const died = recordAlphaOutcome(
      progress,
      returning,
      ended("lost", { speciesId: "brute", survived: false }),
      "west",
      12,
      NEMESIS_LORE,
    );
    expect(died.nemeses).toEqual([]);
    expect(chronicleOf(died).nemesesKilled).toEqual([
      { id: GRINDER.id, name: "Grinder", speciesId: "brute", day: 12 },
    ]);
  });

  it("records nothing on a win, without a crowned alpha, or without Alpha Present", () => {
    const progress = progressWith([]);
    const offer = alphaOffer({ name: "Rattle", level: 0 });
    expect(
      recordAlphaOutcome(
        progress,
        offer,
        ended("won", { speciesId: "brute", survived: true }),
        "east",
        12,
        NEMESIS_LORE,
      ),
    ).toBe(progress);
    expect(
      recordAlphaOutcome(
        progress,
        offer,
        ended("lost", undefined),
        "east",
        12,
        NEMESIS_LORE,
      ),
    ).toBe(progress);
    expect(
      recordAlphaOutcome(
        progress,
        alphaOffer(undefined),
        ended("lost", { speciesId: "brute", survived: true }),
        "east",
        12,
        NEMESIS_LORE,
      ),
    ).toBe(progress);
  });
});
